// ─── Prometheus Text Exposition Format Helpers ───────────────────────────────
// https://prometheus.io/docs/instrumenting/exposition_formats/

/**
 * Escape a label value for Prometheus text format.
 * Backslashes, double-quotes, and newlines must be escaped.
 */
export function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Format a set of labels into the `{key="value",...}` string.
 * Returns empty string if no labels.
 */
export function formatLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const parts = Object.entries(labels).map(
    ([k, v]) => `${k}="${escapeLabel(v)}"`,
  );
  return `{${parts.join(",")}}`;
}

/**
 * Emit a single metric sample line: `metric_name{labels} value`
 */
export function formatSample(
  name: string,
  value: number,
  labels?: Record<string, string>,
): string {
  return `${name}${formatLabels(labels)} ${value}`;
}

/**
 * Emit a complete gauge metric block with HELP, TYPE, and one or more samples.
 */
export function formatGauge(
  name: string,
  help: string,
  samples: { value: number; labels?: Record<string, string> }[],
): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const s of samples) {
    lines.push(formatSample(name, s.value, s.labels));
  }
  return lines.join("\n");
}

/**
 * Shorthand for a gauge with a single sample (most common case).
 */
export function formatGaugeSingle(
  name: string,
  help: string,
  value: number,
  labels?: Record<string, string>,
): string {
  return formatGauge(name, help, [{ value, labels }]);
}

/**
 * Emit a complete counter metric block.
 */
export function formatCounter(
  name: string,
  help: string,
  samples: { value: number; labels?: Record<string, string> }[],
): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const s of samples) {
    lines.push(formatSample(name, s.value, s.labels));
  }
  return lines.join("\n");
}

/**
 * Emit an info metric (gauge with value 1 carrying labels).
 * Used for version/build info style metrics.
 */
export function formatInfo(
  name: string,
  help: string,
  labels: Record<string, string>,
): string {
  return formatGauge(name, help, [{ value: 1, labels }]);
}

/**
 * Parse a string that may contain units (e.g. "-47dBm", "100%", "3.14")
 * into a float. Returns NaN if unparseable.
 */
export function safeFloat64(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  // Strip common suffixes
  const cleaned = value.replace(/[a-zA-Z%]+$/, "").trim();
  if (cleaned === "") return NaN;
  return parseFloat(cleaned);
}

/**
 * Parse a boolean-like value ("true", "1", "enable", "on") into 1 or 0.
 * Returns NaN if not recognizable.
 */
export function safeBool(value: unknown): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value !== 0 ? 1 : 0;
  if (typeof value !== "string") return NaN;
  const lower = value.toLowerCase();
  if (["true", "1", "enable", "on", "yes"].includes(lower)) return 1;
  if (["false", "0", "disable", "off", "no"].includes(lower)) return 0;
  return NaN;
}
