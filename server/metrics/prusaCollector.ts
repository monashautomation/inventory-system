// ─── Prusa Metrics Collector ─────────────────────────────────────────────────
// Scrapes PrusaLink REST API endpoints for every PRUSA printer in the DB and
// emits Prometheus-compatible text metrics.  Ported from the Go prusa_exporter.

import { prisma } from "@/server/lib/prisma";
import { formatGauge } from "./format";

// ─── PrusaLink API response types ───────────────────────────────────────────

interface PrusaVersion {
  api: string;
  server: string;
  original: string;
  text: string;
  hostname: string;
}

interface PrusaJob {
  state: string;
  job: {
    estimatedPrintTime: number;
    file: { name: string; path: string; display: string; size: number };
  } | null;
  progress: {
    printTimeLeft: number;
    completion: number;
    printTime: number;
  } | null;
}

interface PrusaPrinter {
  telemetry: {
    "temp-bed": number;
    "temp-nozzle": number;
    "print-speed": number;
    "z-height": number;
    material: string;
    axis_x: number;
    axis_y: number;
    axis_z: number;
  };
  temperature: {
    tool0: { actual: number; target: number };
    bed: { actual: number; target: number };
  };
  state: {
    text: string;
    flags: {
      operational: boolean;
      paused: boolean;
      printing: boolean;
      cancelling: boolean;
      pausing: boolean;
      error: boolean;
      sdReady: boolean;
      closedOnError: boolean;
      ready: boolean;
      busy: boolean;
      closedOrError: boolean;
      finished: boolean;
      prepared: boolean;
    };
  };
}

interface PrusaStatus {
  printer: {
    state: string;
    fan_hotend: number;
    fan_print: number;
    flow: number;
    speed: number;
  };
}

interface PrusaInfo {
  mmu: boolean;
  name: string;
  location: string;
  nozzle_diameter: number;
  serial: string;
  hostname: string;
}

// ─── Printer model detection (from Go prusalink.go) ─────────────────────────

const PRINTER_TYPES: Record<string, string> = {
  PrusaMINI: "MINI",
  PrusaMK4: "MK4",
  PrusaXL: "XL",
  "PrusaLink I3MK3S": "I3MK3S",
  "PrusaLink I3MK3": "I3MK3",
  "PrusaLink I3MK25S": "I3MK25S",
  "PrusaLink I3MK25": "I3MK25",
  "prusa-sl1": "SL1",
  "prusa-sl1s": "SL1S",
  Prusa_iX: "IX",
};

/** Cache detected printer models across scrapes. */
const printerModelCache = new Map<string, string>();

function detectPrinterModel(
  address: string,
  version: PrusaVersion | null,
  info: PrusaInfo | null,
): string {
  if (!version) return printerModelCache.get(address) ?? "PRUSA";
  const hostname = version.original || version.hostname || info?.hostname || "";
  const detected = PRINTER_TYPES[hostname] || hostname || "PRUSA";
  printerModelCache.set(address, detected);
  return detected;
}

// ─── State flag mapping (from Go prusalink.go getStateFlag) ─────────────────

function getStateFlag(printer: PrusaPrinter): number {
  const f = printer.state.flags;
  if (f.operational) return 1;
  if (f.prepared) return 2;
  if (f.paused) return 3;
  if (f.printing) return 4;
  if (f.cancelling) return 5;
  if (f.pausing) return 6;
  if (f.error) return 7;
  if (f.sdReady) return 8;
  if (f.closedOrError || f.closedOnError) return 9;
  if (f.ready) return 10;
  if (f.busy) return 11;
  if (f.finished) return 12;
  return 0;
}

// ─── HTTP access ────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

async function fetchEndpoint<T>(
  ip: string,
  path: string,
  apiKey: string,
): Promise<T | null> {
  const url = `http://${ip}${path}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "X-Api-Key": apiKey },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[prusa-metrics] ${url} returned HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[prusa-metrics] ${url} — ${msg}`);
    return null;
  }
}

// ─── Per-sample entry (accumulated across printers, then grouped) ───────────

interface SampleEntry {
  metric: string;
  help: string;
  value: number;
  labels: Record<string, string>;
}

// ─── Scrape a single printer ────────────────────────────────────────────────

async function scrapePrinter(printer: {
  name: string;
  ipAddress: string;
  authToken: string | null;
}): Promise<SampleEntry[]> {
  const samples: SampleEntry[] = [];
  const apiKey = printer.authToken ?? "";
  const addr = printer.ipAddress;
  const name = printer.name;

  const cachedModel = printerModelCache.get(addr) ?? "PRUSA";

  // Helper: add a sample
  const s = (
    metric: string,
    help: string,
    value: number,
    labels: Record<string, string>,
  ) => samples.push({ metric, help, value, labels });

  // ── Fetch job (required — if fails, printer is offline) ──
  const job = await fetchEndpoint<PrusaJob>(addr, "/api/job", apiKey);
  if (!job) {
    s("prusa_up", "Whether the printer is reachable", 0, {
      printer_address: addr,
      printer_model: cachedModel,
      printer_name: name,
    });
    return samples;
  }

  // ── Fetch printer data (required) ──
  const pd = await fetchEndpoint<PrusaPrinter>(addr, "/api/printer", apiKey);
  if (!pd) {
    s("prusa_up", "Whether the printer is reachable", 0, {
      printer_address: addr,
      printer_model: cachedModel,
      printer_name: name,
    });
    return samples;
  }

  // ── Fetch version (required) ──
  const ver = await fetchEndpoint<PrusaVersion>(addr, "/api/version", apiKey);
  if (!ver) {
    s("prusa_up", "Whether the printer is reachable", 0, {
      printer_address: addr,
      printer_model: cachedModel,
      printer_name: name,
    });
    return samples;
  }

  // ── Fetch status & info (optional — failures are non-fatal) ──
  const [status, info] = await Promise.all([
    fetchEndpoint<PrusaStatus>(addr, "/api/v1/status", apiKey),
    fetchEndpoint<PrusaInfo>(addr, "/api/v1/info", apiKey),
  ]);

  // Detect model
  const model = detectPrinterModel(addr, ver, info);

  // Build common label sets
  const jobName = job.job?.file?.name ?? "";
  const jobPath = job.job?.file?.path ?? "";

  const common = (extra?: Record<string, string>): Record<string, string> => ({
    printer_address: addr,
    printer_model: model,
    printer_name: name,
    printer_job_name: jobName,
    printer_job_path: jobPath,
    ...extra,
  });

  const special: Record<string, string> = {
    printer_address: addr,
    printer_model: model,
    printer_name: name,
  };

  // ── prusa_info (info-style gauge, value = 1) ──
  s("prusa_info", "Printer version and identity information", 1, {
    ...common(),
    api_version: ver.api ?? "",
    server_version: ver.server ?? "",
    version_text: ver.text ?? "",
    prusalink_name: info?.name ?? "",
    printer_location: info?.location ?? "",
    serial_number: info?.serial ?? "",
    printer_hostname: info?.hostname ?? "",
  });

  // ── prusa_job ──
  const hasJob = jobName !== "";
  s(
    "prusa_job",
    "Current print job information (1 = job active, 0 = no job)",
    hasJob ? 1 : 0,
    {
      printer_address: addr,
      printer_model: model,
      printer_name: name,
      printer_job_name: jobName,
      printer_job_path: jobPath,
    },
  );

  // ── Fan speeds (from /api/v1/status) ──
  if (status) {
    s(
      "prusa_fan_speed_rpm",
      "Fan speed in RPM",
      status.printer.fan_hotend,
      common({ fan: "hotend" }),
    );
    s(
      "prusa_fan_speed_rpm",
      "Fan speed in RPM",
      status.printer.fan_print,
      common({ fan: "print" }),
    );
    // ── Flow ratio ──
    s(
      "prusa_print_flow_ratio",
      "Filament flow ratio (0.0–1.0)",
      status.printer.flow / 100,
      common(),
    );
  }

  // ── Nozzle size ──
  if (info) {
    s(
      "prusa_nozzle_size_meters",
      "Selected nozzle diameter",
      info.nozzle_diameter,
      common(),
    );
    // ── MMU ──
    s(
      "prusa_mmu",
      "Whether MMU is enabled (1 = yes, 0 = no)",
      info.mmu ? 1 : 0,
      common(),
    );
  }

  // ── Print speed ratio ──
  s(
    "prusa_print_speed_ratio",
    "Current printer speed setting (0.0–1.0)",
    (pd.telemetry["print-speed"] ?? 0) / 100,
    common(),
  );

  // ── Print time ──
  s(
    "prusa_print_time_seconds",
    "Current print elapsed time in seconds",
    job.progress?.printTime ?? 0,
    common(),
  );

  // ── Time remaining ──
  s(
    "prusa_printing_time_remaining_seconds",
    "Estimated remaining print time in seconds",
    job.progress?.printTimeLeft ?? 0,
    common(),
  );

  // ── Progress ratio ──
  s(
    "prusa_printing_progress_ratio",
    "Print completion ratio (0.0–1.0)",
    job.progress?.completion ?? 0,
    common(),
  );

  // ── Material info ──
  const material = pd.telemetry.material ?? "";
  s(
    "prusa_material_info",
    "Loaded filament info (0 = no filament)",
    material.includes("-") ? 0 : 1,
    common({ printer_filament: material }),
  );

  // ── Axis positions ──
  s(
    "prusa_axis",
    "Axis position",
    pd.telemetry.axis_x ?? 0,
    common({ printer_axis: "x" }),
  );
  s(
    "prusa_axis",
    "Axis position",
    pd.telemetry.axis_y ?? 0,
    common({ printer_axis: "y" }),
  );
  s(
    "prusa_axis",
    "Axis position",
    pd.telemetry.axis_z ?? 0,
    common({ printer_axis: "z" }),
  );

  // ── Temperatures ──
  s(
    "prusa_temperature_celsius",
    "Current temperature in Celsius",
    pd.temperature.bed.actual,
    common({ printer_heated_element: "bed" }),
  );
  s(
    "prusa_temperature_celsius",
    "Current temperature in Celsius",
    pd.temperature.tool0.actual,
    common({ printer_heated_element: "tool0" }),
  );

  // ── Target temperatures ──
  s(
    "prusa_temperature_target_celsius",
    "Target temperature in Celsius",
    pd.temperature.bed.target,
    common({ printer_heated_element: "bed" }),
  );
  s(
    "prusa_temperature_target_celsius",
    "Target temperature in Celsius",
    pd.temperature.tool0.target,
    common({ printer_heated_element: "tool0" }),
  );

  // ── Status info (state flag) ──
  s(
    "prusa_status_info",
    "Printer state flag (1=Operational … 12=Finished, 0=Unknown)",
    getStateFlag(pd),
    common({ printer_state: pd.state.text }),
  );

  // ── Printer is up ──
  s("prusa_up", "Whether the printer is reachable", 1, special);

  return samples;
}

// ─── Public collection entry point ──────────────────────────────────────────

export async function collectPrusaMetrics(): Promise<string> {
  const printers = await prisma.printer.findMany({
    where: { type: "PRUSA" },
    select: { name: true, ipAddress: true, authToken: true },
  });

  if (printers.length === 0) return "";

  // Scrape all printers concurrently
  const results = await Promise.allSettled(printers.map(scrapePrinter));

  // Flatten all samples
  const allSamples: SampleEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allSamples.push(...result.value);
    } else {
      console.error("[prusa-metrics] Scrape failed:", result.reason);
    }
  }

  if (allSamples.length === 0) return "";

  // Group samples by metric name (so HELP/TYPE appear once)
  const grouped = new Map<
    string,
    {
      help: string;
      samples: { value: number; labels: Record<string, string> }[];
    }
  >();
  for (const entry of allSamples) {
    let group = grouped.get(entry.metric);
    if (!group) {
      group = { help: entry.help, samples: [] };
      grouped.set(entry.metric, group);
    }
    group.samples.push({ value: entry.value, labels: entry.labels });
  }

  // Emit formatted text
  const lines: string[] = [];
  for (const [name, group] of grouped) {
    lines.push(formatGauge(name, group.help, group.samples));
  }

  return lines.join("\n");
}
