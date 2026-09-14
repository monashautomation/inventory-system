// Must be imported before anything else in server/index.ts so the SDK is
// running before Prisma/Hono are set up. index.ts loads dotenv before this
// import — OTel's own env vars (OTEL_EXPORTER_OTLP_ENDPOINT, etc) must be
// set before this module runs, not after.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export const OTEL_SERVICE_NAME = "inventory-system";

// ponytail: Prisma DB spans dropped. @prisma/instrumentation only ships a
// build compatible with Prisma Client 7 (this app is pinned to 6.10); the
// mismatched build throws after otherwise-successful queries. Revisit when
// this app upgrades to Prisma 7 or a 6.x-compatible instrumentation build
// is published.

// HTTP/protobuf (port 4318), not gRPC (4317): Bun's node:http2 layer has an
// open crash bug with @opentelemetry/exporter-trace-otlp-grpc that can kill
// the whole process on export (oven-sh/bun#30342, open-telemetry/
// opentelemetry-js#5812). HTTP/protobuf avoids that code path entirely.
const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    "http://otel-collector-opentelemetry-collector.monitoring.svc.cluster.local:4318/v1/traces";

// Only traces are wired up here — without this, an unconfigured OTel SDK
// auto-enables default OTLP metric/log exporters as soon as an endpoint is
// set, sending unrequested traffic. Must be set before `new NodeSDK(...)`.
process.env.OTEL_METRICS_EXPORTER ??= "none";
process.env.OTEL_LOGS_EXPORTER ??= "none";

// url.full/http.url can carry OAuth codes, magic-link tokens, and other
// query-string secrets from routes this middleware wraps indiscriminately.
// Strip the query string before spans leave the process.
function scrubQueryStrings(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of ["url.full", "http.url", "http.target"]) {
        const value = attrs[key];
        if (typeof value === "string") {
            const qIndex = value.indexOf("?");
            if (qIndex !== -1) attrs[key] = value.slice(0, qIndex);
        }
    }
}

class UrlScrubbingExporter implements SpanExporter {
    private readonly inner: SpanExporter;
    constructor(inner: SpanExporter) {
        this.inner = inner;
    }
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        spans.forEach(scrubQueryStrings);
        this.inner.export(spans, resultCallback);
    }
    shutdown(): Promise<void> {
        return this.inner.shutdown();
    }
}

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME,
    }),
    traceExporter: new UrlScrubbingExporter(new OTLPTraceExporter({ url: endpoint })),
});

sdk.start();

// Bounded so a hung exporter connection can't block process shutdown
// forever; batched spans in flight at exit are still flushed best-effort.
export async function shutdownOtel(): Promise<void> {
    await Promise.race([
        sdk.shutdown(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).catch((err) => {
        console.error("Error shutting down OTel SDK", err);
    });
}
