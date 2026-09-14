// Must be imported before anything else in server/index.ts so the SDK is
// running before Prisma/Hono are set up.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: "inventory-system",
    }),
    traceExporter: new OTLPTraceExporter({
        url:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
            "otel-collector-opentelemetry-collector.monitoring.svc.cluster.local:4317",
    }),
    instrumentations: [new PrismaInstrumentation()],
});

sdk.start();
