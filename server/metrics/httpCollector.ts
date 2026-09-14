// ─── HTTP & Process Metrics Collector ────────────────────────────────────────
// Generic app-health signals (request latency, process uptime/memory) — as
// opposed to the printer/inventory telemetry the other collectors emit.
// In-memory only: counters reset on restart, which is fine for Prometheus
// (it scrapes frequently and cares about rate-of-change, not raw totals).

import { formatGaugeSingle, formatHistogram } from "./format";

const BUCKET_BOUNDS_MS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface RouteStats {
  count: number;
  cumulativeBucketCounts: number[]; // parallel to BUCKET_BOUNDS_MS
  sum: number;
}

const statsByMethodAndStatus = new Map<string, RouteStats>();

export function recordHttpRequest(
  method: string,
  status: number,
  durationMs: number,
): void {
  const key = `${method} ${status}`;
  let stats = statsByMethodAndStatus.get(key);
  if (!stats) {
    stats = {
      count: 0,
      cumulativeBucketCounts: new Array<number>(BUCKET_BOUNDS_MS.length).fill(0),
      sum: 0,
    };
    statsByMethodAndStatus.set(key, stats);
  }
  stats.count += 1;
  stats.sum += durationMs;
  for (let i = 0; i < BUCKET_BOUNDS_MS.length; i++) {
    if (durationMs <= BUCKET_BOUNDS_MS[i]) stats.cumulativeBucketCounts[i] += 1;
  }
}

export function collectHttpMetrics(): string {
  const lines: string[] = [];

  lines.push(
    formatGaugeSingle(
      "inventory_process_uptime_seconds",
      "Process uptime in seconds",
      process.uptime(),
    ),
  );

  const mem = process.memoryUsage();
  lines.push(
    formatGaugeSingle(
      "inventory_process_memory_rss_bytes",
      "Resident set size in bytes",
      mem.rss,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_process_memory_heap_used_bytes",
      "Heap memory used in bytes",
      mem.heapUsed,
    ),
  );

  lines.push(
    formatHistogram(
      "inventory_http_request_duration_ms",
      "HTTP request duration in milliseconds, labeled by method and response status",
      BUCKET_BOUNDS_MS,
      [...statsByMethodAndStatus.entries()].map(([key, stats]) => {
        const [method, status] = key.split(" ");
        return { ...stats, labels: { method, status } };
      }),
    ),
  );

  return lines.join("\n");
}
