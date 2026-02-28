// ─── Metrics Orchestrator ────────────────────────────────────────────────────
// Combines all native metric collectors into a single Prometheus text response.

import { collectInventoryMetrics } from "./metrics/inventoryCollector";
import { collectPrusaMetrics } from "./metrics/prusaCollector";
import { collectBambuMetrics } from "./metrics/bambuCollector";

export async function collectMetrics(): Promise<string> {
  const start = Date.now();
  const prusaEnabled = process.env.METRICS_PRUSA_ENABLED !== 'false';
  const bambuEnabled = process.env.METRICS_BAMBU_ENABLED !== 'false';

  console.log(`[metrics] Scrape started — prusa=${prusaEnabled}, bambu=${bambuEnabled}`);

  const sections: Promise<string>[] = [];

  // Prusa metrics: pull model — scrapes REST API on each request
  if (prusaEnabled) {
    const prusaStart = Date.now();
    sections.push(
      collectPrusaMetrics().then((result) => {
        console.log(`[metrics] Prusa collected in ${Date.now() - prusaStart}ms — ${result.length} chars`);
        return result;
      }),
    );
  }

  // Inventory metrics: pull from DB on each request
  const invStart = Date.now();
  sections.push(
    collectInventoryMetrics().then((result) => {
      console.log(`[metrics] Inventory collected in ${Date.now() - invStart}ms — ${result.length} chars`);
      return result;
    }),
  );

  const results = await Promise.allSettled(sections);
  const output: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      output.push(result.value.trimEnd());
    } else if (result.status === "rejected") {
      console.error("[metrics] Collection error:", result.reason);
      output.push(`# ERROR: Metrics collection failed - ${result.reason}`);
    }
  }

  // Bambu metrics: push model — reads from cached MQTT data (synchronous)
  if (bambuEnabled) {
    const bambuStart = Date.now();
    const bambuOutput = collectBambuMetrics();
    console.log(`[metrics] Bambu collected in ${Date.now() - bambuStart}ms — ${bambuOutput.length} chars`);
    if (bambuOutput) {
      output.push(bambuOutput.trimEnd());
    }
  }

  const total = output.join("\n\n") + "\n";
  console.log(`[metrics] Scrape complete in ${Date.now() - start}ms — ${total.length} chars total`);
  return total;
}

export { initBambuMetricsListener } from "./metrics/bambuCollector";
