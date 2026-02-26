import { config } from 'dotenv';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from '@/server/api/routers/_app';
import { auth } from '@/server/auth';
import { createContext } from '@/server/trpc';
import { HTTPException } from 'hono/http-exception';
import { logger } from "hono/logger";
import { StreamableHTTPTransport } from '@hono/mcp'
import { createMcpServer } from 'trpc-to-mcp';
import { basicAuth } from 'hono/basic-auth'



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
export default {
    port: process.env.PORT ?? 3000,
    fetch: app.fetch,
};
