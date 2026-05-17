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
  model: string | null;
  location: string | null;
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

// ─── Queue types ──────────────────────────────────────────────────────────────

export interface PrintQueueItemCreate {
  archive_id?: number | null;
  library_file_id?: number | null;
  printer_id?: number | null;
  target_model?: string | null;
  target_location?: string | null;
  required_filament_types?: string[] | null;
  filament_overrides?: Record<string, unknown>[] | null;
  ams_mapping?: number[] | null;
  plate_id?: number | null;
  scheduled_time?: string | null;
  require_previous_success?: boolean;
  auto_off_after?: boolean;
  manual_start?: boolean;
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
}

export type QueueStatus =
  | "pending"
  | "printing"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export interface PrintQueueItemResponse {
  id: number;
  printer_id: number | null;
  target_model: string | null;
  target_location: string | null;
  required_filament_types: string[] | null;
  filament_overrides: Record<string, unknown>[] | null;
  waiting_reason: string | null;
  archive_id: number | null;
  library_file_id: number | null;
  position: number;
  scheduled_time: string | null;
  require_previous_success: boolean;
  auto_off_after: boolean;
  manual_start: boolean;
  ams_mapping: number[] | null;
  plate_id: number | null;
  bed_levelling: boolean;
  flow_cali: boolean;
  vibration_cali: boolean;
  layer_inspect: boolean;
  timelapse: boolean;
  use_ams: boolean;
  gcode_injection: boolean;
  status: QueueStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string | null;
  archive_name: string | null;
  archive_thumbnail: string | null;
  library_file_name: string | null;
  library_file_thumbnail: string | null;
  printer_name: string | null;
  print_time_seconds: number | null;
  filament_used_grams: number | null;
  filament_type: string | null;
  filament_color: string | null;
  layer_height: number | null;
  nozzle_diameter: number | null;
  sliced_for_model: string | null;
  created_by_id: number | null;
  created_by_username: string | null;
  batch_id: number | null;
  batch_name: string | null;
  been_jumped: boolean;
}

export interface FilamentRequirement {
  slot_id: number;
  type: string | null;
  color: string | null;
  tray_info_idx: string | null;
  used_grams: number | null;
  used_meters: number | null;
  used_in_plate: boolean;
}

export interface AvailableFilamentSlot {
  printer_id: number;
  printer_name: string;
  ams_id: number;
  tray_id: number;
  flat_index: number;
  tray_type: string | null;
  tray_color: string | null;
  tray_id_name: string | null;
  tray_sub_brands: string | null;
  remain: number;
}

export interface BambuddyArchive {
  id: number;
  filename: string;
  print_name: string | null;
  thumbnail_path: string | null;
  status: string;
  filament_type: string | null;
  filament_color: string | null;
  created_at: string;
}

// ─── Queue API ────────────────────────────────────────────────────────────────

export async function listQueue(opts?: {
  printerId?: number;
  status?: string;
}): Promise<PrintQueueItemResponse[]> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.printerId != null) params.set("printer_id", String(opts.printerId));
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString();
  const res = await fetch(`${endpoint}/api/v1/queue/${qs ? `?${qs}` : ""}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "list queue");
  return res.json() as Promise<PrintQueueItemResponse[]>;
}

export async function addToQueue(
  item: PrintQueueItemCreate,
): Promise<PrintQueueItemResponse> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(item),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "add to queue");
  return res.json() as Promise<PrintQueueItemResponse>;
}

export async function cancelQueueItem(itemId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}/cancel`, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "cancel queue item");
}

export async function deleteQueueItem(itemId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}`, {
    method: "DELETE",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "delete queue item");
}

export async function startQueueItem(itemId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}/start`, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "start queue item");
}

export async function stopQueueItem(itemId: number): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}/stop`, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "stop queue item");
}

export async function getArchiveFilamentRequirements(
  archiveId: number,
): Promise<FilamentRequirement[]> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/archives/${archiveId}/filament-requirements`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(10_000) },
  );
  await checkResponse(res, "get filament requirements");
  const data = (await res.json()) as
    | { filaments?: FilamentRequirement[] }
    | FilamentRequirement[];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.filaments) ? data.filaments : [];
}

/** Build AvailableFilamentSlot list by querying printer statuses directly.
 *  Uses the same AMS data path that works for single-printer targeting.
 *  Optionally filter by printer model and/or location. */
async function collectFilamentSlotsFromStatuses(opts?: {
  model?: string;
  location?: string;
}): Promise<AvailableFilamentSlot[]> {
  const printers = await listBambuddyPrinters();
  const candidates = printers.filter((p) => {
    if (!p.is_active) return false;
    if (opts?.model && p.model !== opts.model) return false;
    if (opts?.location && p.location !== opts.location) return false;
    return true;
  });

  const statuses = await Promise.allSettled(
    candidates.map((p) => getBambuddyPrinterStatus(p.id)),
  );

  const slots: AvailableFilamentSlot[] = [];
  for (let i = 0; i < statuses.length; i++) {
    const result = statuses[i];
    if (result.status !== "fulfilled") continue;
    const status = result.value;
    const printer = candidates[i];
    for (const unit of status.ams) {
      for (const tray of unit.tray) {
        slots.push({
          printer_id: printer.id,
          printer_name: printer.name,
          ams_id: unit.id,
          tray_id: tray.id,
          flat_index: unit.id * 4 + tray.id,
          tray_type: tray.tray_type ?? null,
          tray_color: tray.tray_color ?? null,
          tray_id_name: tray.tray_id_name ?? null,
          tray_sub_brands: tray.tray_sub_brands ?? null,
          remain: tray.remain,
        });
      }
    }
  }
  return slots;
}

export async function getAvailableFilamentsForModel(
  model: string,
  location?: string,
): Promise<AvailableFilamentSlot[]> {
  return collectFilamentSlotsFromStatuses({ model, location });
}

export async function getAllAvailableFilaments(): Promise<
  AvailableFilamentSlot[]
> {
  return collectFilamentSlotsFromStatuses();
}

export async function listBambuddyArchives(opts?: {
  limit?: number;
  offset?: number;
}): Promise<BambuddyArchive[]> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`${endpoint}/api/v1/archives/${qs ? `?${qs}` : ""}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "list archives");
  const data = await res.json();
  return Array.isArray(data) ? (data as BambuddyArchive[]) : [];
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
