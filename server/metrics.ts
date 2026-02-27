// ─── Metrics Orchestrator ────────────────────────────────────────────────────
// Combines all native metric collectors into a single Prometheus text response.

import { collectInventoryMetrics } from "./metrics/inventoryCollector";
import { collectPrusaMetrics } from "./metrics/prusaCollector";
import { collectBambuMetrics } from "./metrics/bambuCollector";

export async function collectMetrics(): Promise<string> {
  const sections: Promise<string>[] = [];

  // Prusa metrics: pull model — scrapes REST API on each request
  sections.push(collectPrusaMetrics());

  // Inventory metrics: pull from DB on each request
  sections.push(collectInventoryMetrics());

  const results = await Promise.allSettled(sections);
  const output: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      output.push(result.value.trimEnd());
    } else if (result.status === "rejected") {
      console.error("Metrics collection error:", result.reason);
      output.push(`# ERROR: Metrics collection failed - ${result.reason}`);
    }
  }

  // Bambu metrics: push model — reads from cached MQTT data (synchronous)
  const bambuOutput = collectBambuMetrics();
  if (bambuOutput) {
    output.push(bambuOutput.trimEnd());
  }

  return output.join("\n\n") + "\n";
}

export { initBambuMetricsCollector } from "./metrics/bambuCollector";
