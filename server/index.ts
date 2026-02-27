import { config } from 'dotenv';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from '@/server/api/routers/_app';
import { auth } from '@/server/auth';
import { prisma } from '@/server/lib/prisma';
import { createContext } from '@/server/trpc';
import { HTTPException } from 'hono/http-exception';
import { logger } from "hono/logger";
import { StreamableHTTPTransport } from '@hono/mcp'
import { createMcpServer } from 'trpc-to-mcp';
import { basicAuth } from 'hono/basic-auth'
import { collectMetrics, initBambuMetricsListener } from './metrics'
import { initBambuMqttPool } from '@/server/lib/bambuMqtt'
import { initBambuStatusListener } from '@/server/lib/bambu'



// Load environment variables
config();

// Initialize Hono app
const app = new Hono();


app.use(logger());


// Apply CORS middleware
app.use(
    '/api/*',
    cors({
        origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
        credentials: true,
        maxAge: 86400, // 24 hours
    })
);


//app.use('/*', serveStatic({ root: './dist' })); // Add this to serve dist/

// Handle authentication routes
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    try {
        const response = await auth.handler(c.req.raw);
        return response;
    } catch (error) {
        console.error('Auth handler error:', error);
        throw new HTTPException(500, { message: 'Authentication processing failed' });
    }
});

// tRPC route
app.use(
    '/api/trpc/*',
    trpcServer({
        endpoint: "/api/trpc",
        router: appRouter,
        createContext,
        onError: ({ error, path }) => {
            console.error(`tRPC error on ${path}:`, error);
        },
    })
);

//app.get('*', serveStatic({ path: './dist/index.html' }));
// Global error handler
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
    }
    console.error('Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
});

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok' }));

// ─── Webcam proxy ────────────────────────────────────────────────────────────
// Streams printer webcam feeds through the server so clients outside the local
// network can view them. Requires an authenticated session.
app.get('/api/webcam/:printerId', async (c) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });
    if (!session?.user?.id) {
        throw new HTTPException(401, { message: 'Authentication required' });
    }

    const printerId = c.req.param('printerId');
    const printer = await prisma.printer.findUnique({
        where: { id: printerId },
        select: { webcamUrl: true, name: true },
    });

    if (!printer?.webcamUrl) {
        throw new HTTPException(404, { message: 'Printer or webcam URL not found' });
    }

    // Convert stream URL to snapshot URL when requested
    let upstreamUrl = printer.webcamUrl;
    const mode = c.req.query('mode');
    if (mode === 'snapshot' && upstreamUrl.includes('action=stream')) {
        upstreamUrl = upstreamUrl.replace('action=stream', 'action=snapshot');
    }

    // Abort upstream fetch when client disconnects
    const upstream = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => upstream.abort());

    let upstreamRes: Response;
    try {
        upstreamRes = await fetch(upstreamUrl, {
            signal: upstream.signal,
            headers: { Accept: '*/*' },
        });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return c.body(null, 499 as any);
        }
        console.error(`Webcam proxy failed for ${printer.name}:`, error);
        throw new HTTPException(502, { message: 'Failed to connect to printer webcam' });
    }

    if (!upstreamRes.ok) {
        throw new HTTPException(502, {
            message: `Printer webcam returned HTTP ${upstreamRes.status}`,
        });
    }

    if (!upstreamRes.body) {
        throw new HTTPException(502, { message: 'Printer webcam returned empty body' });
    }

    // Forward content-type verbatim (critical for MJPEG multipart/x-mixed-replace)
    const headers = new Headers();
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('X-Accel-Buffering', 'no');

    return new Response(upstreamRes.body, { status: 200, headers });
});


// MCP route
const mcpPassword = process.env.MCP_PASSWORD;
if (!mcpPassword) {
    throw new Error('MCP_PASSWORD environment variable is required');
}
app.use('/mcp', basicAuth({
    username: 'bot',
    password: mcpPassword,
    realm: 'Inventory System MCP',
    invalidUserMessage: 'Access denied: Invalid credentials',
}));

app.all('/mcp', async (c) => {
    try {
        // Create tRPC context for the current request
        const context = await createContext(
            {
                req: c.req.raw,
                resHeaders: new Headers(),
                info: {
                    accept: c.req.header('trpc-accept') === 'application/jsonl' ? 'application/jsonl' : null,
                    type: 'query', // Default; adjust to 'mutation' or 'subscription' if needed
                    isBatchCall: false, // Assume no batch calls unless specified
                    calls: [], // Empty array unless you expect specific procedure calls
                    connectionParams: null, // No connection params unless using subscriptions
                    signal: c.req.raw.signal, // Use request's AbortSignal
                    url: new URL(c.req.raw.url), // Construct URL from request
                },
            },
            c
        );

        // Create McpServer instance for this request
        const mcpServer = createMcpServer(
            {
                name: 'trpc-mcp',
                version: '0.0.1',
            },
            appRouter,
            context
        );

        // Create transport and handle the request
        const transport = new StreamableHTTPTransport();
        await mcpServer.connect(transport);
        return transport.handleRequest(c);
    } catch (error) {
        console.error('MCP route error:', error);
        throw new HTTPException(500, { message: 'MCP processing failed' });
    }
});

// ─── Metrics endpoint ─────────────────────────────────────────────────────────
// Prometheus-compatible metrics endpoint. Enable via METRICS_ENABLED=true.
// Natively scrapes Prusa REST API, caches Bambu MQTT data, and queries Prisma.
const metricsEnabled = process.env.METRICS_ENABLED === 'true';
if (metricsEnabled) {
    const metricsUsername = process.env.METRICS_USERNAME;
    const metricsPassword = process.env.METRICS_PASSWORD;
    if (!metricsUsername || !metricsPassword) {
        throw new Error('METRICS_USERNAME and METRICS_PASSWORD are required when METRICS_ENABLED=true');
    }
    app.use('/metrics', basicAuth({
        username: metricsUsername,
        password: metricsPassword,
        realm: 'Inventory System Metrics',
        invalidUserMessage: 'Access denied: Invalid credentials',
    }));
    app.get('/metrics', async (c) => {
        try {
            const body = await collectMetrics();
            return c.text(body, 200, {
                'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            });
        } catch (error) {
            console.error('Metrics endpoint error:', error);
            throw new HTTPException(500, { message: 'Failed to collect metrics' });
        }
    });
}

// ─── Initialize shared Bambu MQTT pool + listeners on startup ────────────────
// The pool owns all MQTT connections; bambu.ts (status) and bambuCollector.ts
// (metrics) register message listeners on it.
initBambuMqttPool().then(() => {
    // Register status listener (for getBambuStatus in print routes)
    initBambuStatusListener();
    // Register metrics listener (for /metrics endpoint) when metrics enabled
    if (metricsEnabled && process.env.METRICS_BAMBU_ENABLED !== 'false') {
        initBambuMetricsListener();
    }
}).catch((err) => {
    console.error('Failed to initialize Bambu MQTT pool:', err);
});

export default {
    port: process.env.PORT ?? 3000,
    fetch: app.fetch,
};
