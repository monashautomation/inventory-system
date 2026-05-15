// ─── Metrics Orchestrator ────────────────────────────────────────────────────
// Combines all native metric collectors into a single Prometheus text response.

import { collectInventoryMetrics } from "./metrics/inventoryCollector";
import { collectPrusaMetrics } from "./metrics/prusaCollector";
import {
    collectBambuMetrics,
    collectBambuPrometheusMetrics,
} from "./metrics/bambuCollector";
import { logger as rootLogger } from "@/server/lib/logger";

const logger = rootLogger.child({ module: "metrics" });

function extractMetricNames(payload: string): Set<string> {
    const names = new Set<string>();
    const lines = payload.split("\n");

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("# HELP ") || trimmed.startsWith("# TYPE ")) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 3) names.add(parts[2]);
            continue;
        }

        if (trimmed.startsWith("#")) continue;

        const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)/.exec(trimmed);
        if (match) names.add(match[1]);
    }

    return names;
}

export async function collectMetrics(): Promise<string> {
    const start = Date.now();
    const prusaEnabled = process.env.METRICS_PRUSA_ENABLED !== "false";
    const bambuEnabled = process.env.METRICS_BAMBU_ENABLED !== "false";
    const bambuSource = (
        process.env.METRICS_BAMBU_SOURCE ?? "prometheus"
    ).toLowerCase();
    const useBambuddyPrometheus = bambuSource === "prometheus";

    logger.debug({ prusaEnabled, bambuEnabled, bambuSource }, "Scrape started");

    const sections: Promise<string>[] = [];

    // Prusa metrics: pull model — scrapes REST API on each request
    if (prusaEnabled) {
        const prusaStart = Date.now();
        sections.push(
            collectPrusaMetrics().then((result) => {
                logger.debug({ ms: Date.now() - prusaStart, chars: result.length }, "Prusa collected");
                return result;
            }),
        );
    }

    // Inventory metrics: pull from DB on each request
    const invStart = Date.now();
    sections.push(
        collectInventoryMetrics().then((result) => {
            logger.debug({ ms: Date.now() - invStart, chars: result.length }, "Inventory collected");
            return result;
        }),
    );

    const results = await Promise.allSettled(sections);
    const output: string[] = [];

    for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
            output.push(result.value.trimEnd());
        } else if (result.status === "rejected") {
            logger.error({ err: result.reason }, "Collection error");
            output.push(
                `# ERROR: Metrics collection failed - ${result.reason}`,
            );
        }
    }

    // Bambu metrics can come from either:
    // 1) legacy cache (mapped from /status API polling), or
    // 2) Bambuddy native Prometheus endpoint (/api/v1/metrics).
    if (bambuEnabled) {
        const bambuStart = Date.now();
        let bambuOutput = "";

            if (useBambuddyPrometheus) {
                try {
                    const prometheusPayload = await collectBambuPrometheusMetrics();

                    if (prometheusPayload) {
                        const existingNames = extractMetricNames(output.join("\n\n"));
                        const bambuNames = extractMetricNames(prometheusPayload);
                        const collisions = [...bambuNames].filter((name) => existingNames.has(name));

                        if (collisions.length === 0) {
                            // Prometheus payload looks safe to pass-through.
                            bambuOutput = prometheusPayload;
                        } else {
                            // Collision — fall back to legacy collector so /metrics remains valid.
                            logger.warn({ collisions }, "Bambuddy Prometheus metrics collision, falling back to legacy collector");
                            bambuOutput = collectBambuMetrics();
                        }
                    } else {
                        // Empty response — fall back to legacy collector.
                        logger.warn("Bambuddy Prometheus payload empty, falling back to legacy collector");
                        bambuOutput = collectBambuMetrics();
                    }
                } catch (error) {
                    logger.error({ err: error }, "Bambuddy Prometheus fetch failed, falling back to legacy collector");
                    bambuOutput = collectBambuMetrics();
                }
            } else {
                bambuOutput = collectBambuMetrics();
            }

        logger.debug({ ms: Date.now() - bambuStart, chars: bambuOutput.length }, "Bambu collected");
        if (bambuOutput) {
            output.push(bambuOutput.trimEnd());
        }
    }

    const total = output.join("\n\n") + "\n";
    logger.debug({ ms: Date.now() - start, chars: total.length }, "Scrape complete");
    return total;
}

export { initBambuMetricsListener } from "./metrics/bambuCollector";
