import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function getConfig(): { endpoint: string; apiKey: string } {
  const endpoint = process.env.BAMBUDDY_ENDPOINT?.replace(/\/$/, "");
  const apiKey = process.env.BAMBUDDY_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error(
      "BAMBUDDY_ENDPOINT and BAMBUDDY_API_KEY must be set in environment.",
    );
  }
  return { endpoint, apiKey };
}

function headers(apiKey: string): Record<string, string> {
  return { "X-API-Key": apiKey };
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const safeBody = (body || "<empty>").replace(/\s+/g, " ").slice(0, 1024);
    throw new Error(
      `BambBuddy ${context} failed (HTTP ${res.status}): ${safeBody}`,
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BambuddyPrinter {
  id: number;
  name: string;
  serial_number: string;
  ip_address: string;
  is_active: boolean;
}

export interface AMSTray {
  id: number;
  tray_color: string | null;
  tray_type: string | null;
  tray_sub_brands: string | null;
  tray_id_name: string | null;
  tray_info_idx: string | null;
  remain: number;
  k: number | null;
  cali_idx: number | null;
  tag_uid: string | null;
  tray_uuid: string | null;
  nozzle_temp_min: number | null;
  nozzle_temp_max: number | null;
  drying_temp: number | null;
  drying_time: number | null;
  state: number | null;
}

export interface AMSUnit {
  id: number;
  humidity: number | null;
  temp: number | null;
  is_ams_ht: boolean;
  tray: AMSTray[];
  serial_number: string;
  sw_ver: string;
  dry_time: number;
  dry_status: number;
  module_type: string;
}

export interface HMSError {
  code: string;
  attr: number;
  module: number;
  severity: number;
}

export interface BambuddyPrinterStatus {
  id: number;
  name: string;
  connected: boolean;
  state: string | null;
  current_print: string | null;
  subtask_name: string | null;
  gcode_file: string | null;
  progress: number | null;
  remaining_time: number | null;
  layer_num: number | null;
  total_layers: number | null;
  temperatures: {
    nozzle?: number;
    target_nozzle?: number;
    bed?: number;
    target_bed?: number;
    chamber?: number;
  } | null;
  hms_errors: HMSError[];
  ams: AMSUnit[];
  ams_exists: boolean;
  vt_tray: AMSTray[];
  wifi_signal: number | null;
  sdcard: boolean;
  nozzles: { nozzle_type: string; nozzle_diameter: string }[];
}

export interface ReprintOptions {
  plate_id?: number | null;
  plate_name?: string | null;
  ams_mapping?: number[] | null;
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
}

// ─── In-memory printer ID cache ───────────────────────────────────────────────
// Maps local identifiers (ip or serial) → BambBuddy printer_id.
// Cleared after 5 minutes so stale data doesn't survive printer reconfigs.

interface CacheEntry {
  printerId: number;
  expiresAt: number;
}

const printerIdCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): number | null {
  const entry = printerIdCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    printerIdCache.delete(key);
    return null;
  }
  return entry.printerId;
}

function setCache(key: string, printerId: number): void {
  printerIdCache.set(key, {
    printerId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listBambuddyPrinters(): Promise<BambuddyPrinter[]> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/printers/`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "list printers");
  return res.json() as Promise<BambuddyPrinter[]>;
}

/** Resolve the BambBuddy integer printer_id by matching IP address or serial number. */
export async function resolveBambuddyPrinterId(opts: {
  ipAddress?: string | null;
  serialNumber?: string | null;
}): Promise<number | null> {
  const cacheKey = opts.serialNumber ?? opts.ipAddress ?? "";
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached;
  }

  const printers = await listBambuddyPrinters();

  const match = printers.find((p) => {
    if (opts.serialNumber && p.serial_number === opts.serialNumber) return true;
    if (opts.ipAddress && p.ip_address === opts.ipAddress) return true;
    return false;
  });

  if (!match) return null;

  if (cacheKey) setCache(cacheKey, match.id);
  return match.id;
}

export async function getBambuddyPrinterStatus(
  printerId: number,
): Promise<BambuddyPrinterStatus> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/printers/${printerId}/status`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "get printer status");
  return res.json() as Promise<BambuddyPrinterStatus>;
}

/** Upload a .3mf file to BambBuddy and return the archive_id. */
export async function uploadArchive(
  filename: string,
  fileBuffer: Buffer,
): Promise<number> {
  const { endpoint, apiKey } = getConfig();

  const tmpPath = join(tmpdir(), `bambuddy_upload_${Date.now()}_${filename}`);
  await writeFile(tmpPath, fileBuffer);

  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileBuffer], { type: "application/octet-stream" }),
      filename,
    );

    const res = await fetch(`${endpoint}/api/v1/archives/upload`, {
      method: "POST",
      headers: headers(apiKey),
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    await checkResponse(res, "upload archive");

    const data = (await res.json()) as { id?: number; archive_id?: number };
    const archiveId = data.id ?? data.archive_id;
    if (typeof archiveId !== "number") {
      throw new Error(
        `BambBuddy upload response missing id: ${JSON.stringify(data)}`,
      );
    }
    return archiveId;
  } finally {
    unlink(tmpPath).catch(() => undefined);
  }
}

/** Send an uploaded archive to a printer. */
export async function reprintArchive(
  archiveId: number,
  printerId: number,
  opts: ReprintOptions = {},
): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const url = `${endpoint}/api/v1/archives/${archiveId}/reprint?printer_id=${printerId}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal: AbortSignal.timeout(30_000),
  });
  await checkResponse(res, "reprint archive");
}

export async function pauseBambuddyPrint(printerId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/printers/${printerId}/print/pause`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await checkResponse(res, "pause print");
}

export async function resumeBambuddyPrint(printerId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/printers/${printerId}/print/resume`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await checkResponse(res, "resume print");
}

export async function stopBambuddyPrint(printerId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/printers/${printerId}/print/stop`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await checkResponse(res, "stop print");
}

export async function getBambuddyStreamToken(): Promise<string> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/printers/camera/stream-token`, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "get stream token");
  const data = (await res.json()) as { token?: string };
  if (!data.token)
    throw new Error("BamBuddy stream-token response missing token field");
  return data.token;
}

export function getBambuddyStreamUrl(
  printerId: number,
  token: string,
  fps = 15,
): string {
  const { endpoint } = getConfig();
  return `${endpoint}/api/v1/printers/${printerId}/camera/stream?token=${encodeURIComponent(token)}&fps=${fps}`;
}

export async function stopBambuddyCameraStream(
  printerId: number,
): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/printers/${printerId}/camera/stop`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  // Ignore errors — stream may have already stopped
  res.body?.cancel().catch(() => undefined);
}

/** Fetch Prometheus-formatted metrics directly from Bambuddy. */
export async function getBambuddyPrometheusMetrics(): Promise<string> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/metrics`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "get prometheus metrics");
  return res.text();
}

/** Fetch status for all BamBuddy printers in parallel. Failed individual lookups are skipped. */
export async function listBambuddyPrinterStatuses(): Promise<
  BambuddyPrinterStatus[]
> {
  const printers = await listBambuddyPrinters();
  const results = await Promise.allSettled(
    printers.map((p) => getBambuddyPrinterStatus(p.id)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
