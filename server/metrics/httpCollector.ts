// ─── HTTP & Process Metrics Collector ────────────────────────────────────────
// Generic app-health signals (request latency, process uptime/memory) — as
// opposed to the printer/inventory telemetry the other collectors emit.
// In-memory only: counters reset on restart, which is fine for Prometheus
// (it scrapes frequently and cares about rate-of-change, not raw totals).

import { formatGaugeSingle, formatHistogram } from "./format";

const BUCKET_BOUNDS_SECONDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Fixed allowlist, not the raw request method: an HTTP client can send any
// method token it likes, and every distinct one used to become a permanent
// series in statsByMethodAndStatus — unbounded cardinality, never evicted.
const KNOWN_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
function normalizeMethod(method: string): string {
  return KNOWN_METHODS.has(method) ? method : "OTHER";
}

interface RouteStats {
  count: number;
  cumulativeBucketCounts: number[]; // parallel to BUCKET_BOUNDS_SECONDS
  sum: number;
}

const statsByMethodAndStatus = new Map<string, RouteStats>();

export function recordHttpRequest(
  method: string,
  status: number,
  durationMs: number,
): void {
  const durationSeconds = durationMs / 1000;
  const key = `${normalizeMethod(method)} ${status}`;
  let stats = statsByMethodAndStatus.get(key);
  if (!stats) {
    stats = {
      count: 0,
      cumulativeBucketCounts: new Array<number>(BUCKET_BOUNDS_SECONDS.length).fill(0),
      sum: 0,
    };
    statsByMethodAndStatus.set(key, stats);
  }
  stats.count += 1;
  stats.sum += durationSeconds;
  for (let i = 0; i < BUCKET_BOUNDS_SECONDS.length; i++) {
    if (durationSeconds <= BUCKET_BOUNDS_SECONDS[i]) stats.cumulativeBucketCounts[i] += 1;
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
      "inventory_http_request_duration_seconds",
      "HTTP request duration in seconds, labeled by method and response status",
      BUCKET_BOUNDS_SECONDS,
      [...statsByMethodAndStatus.entries()].map(([key, stats]) => {
        const [method, status] = key.split(" ");
        return { ...stats, labels: { method, status } };
      }),
    ),
  );

  return lines.join("\n");
}
