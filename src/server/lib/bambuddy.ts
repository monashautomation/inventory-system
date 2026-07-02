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

async function loginForBearer(): Promise<string> {
  const endpoint = process.env.BAMBUDDY_ENDPOINT?.replace(/\/$/, "");
  const username = process.env.BAMBUDDY_USERNAME;
  const password = process.env.BAMBUDDY_PASSWORD;
  if (!endpoint || !username || !password) {
    throw new Error(
      "BAMBUDDY_ENDPOINT, BAMBUDDY_USERNAME, and BAMBUDDY_PASSWORD must be set for file uploads.",
    );
  }
  const res = await fetch(`${endpoint}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BamBuddy login failed (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("BamBuddy login response missing access_token");
  }
  return data.access_token;
}

interface BambuddyFilamentDeficit {
  slot_id: number;
  ams_id: number;
  tray_id: number;
  filament_type: string;
  required_grams: number;
  remaining_grams: number;
}

interface BambuddyErrorDetail {
  code: string;
  deficit?: BambuddyFilamentDeficit[];
  [key: string]: unknown;
}

export class BambuddyError extends Error {
  readonly status: number;
  readonly detail: BambuddyErrorDetail | null;

  constructor(
    status: number,
    detail: BambuddyErrorDetail | null,
    rawBody: string,
    context: string,
  ) {
    super(`BamBuddy ${context} failed (HTTP ${status}): ${rawBody}`);
    this.name = "BambuddyError";
    this.status = status;
    this.detail = detail;
  }
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail: BambuddyErrorDetail | null = null;
    try {
      const parsed = JSON.parse(body) as { detail?: BambuddyErrorDetail };
      if (parsed?.detail && typeof parsed.detail === "object") {
        detail = parsed.detail;
      }
    } catch {}
    const safeBody = (body || "<empty>").replace(/\s+/g, " ").slice(0, 1024);
    throw new BambuddyError(res.status, detail, safeBody, context);
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
  awaiting_plate_clear: boolean;
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

/**
 * Build a multipart/form-data ReadableStream for a single file field.
 * Returns the stream, its content-type (with boundary), and the exact byte
 * length so callers can set Content-Length on the request.
 * The optional onProgress callback fires after each chunk is enqueued.
 */
function makeMultipartStream(
  filename: string,
  buffer: Buffer,
  onProgress?: (sent: number, total: number) => void,
): {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
} {
  // Reject filenames that could inject CRLF or other control characters into
  // the Content-Disposition header. Expected input is a Bambu Studio export.
  if (!/^[\w.\- ]{1,255}\.3mf$/i.test(filename)) {
    throw new Error(`Invalid 3MF filename: "${filename}"`);
  }

  const boundary = `FormBoundary${crypto.randomUUID().replace(/-/g, "")}`;
  // Allowlist above guarantees filename contains only [\w.\- ] — no quotes,
  // no CRLF — so interpolating into a quoted-string is safe here.
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = preamble.length + buffer.length + epilogue.length;
  const parts: Buffer[] = [preamble, buffer, epilogue];

  const CHUNK = 64 * 1024;
  let partIndex = 0;
  let offset = 0;
  let sent = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      while (partIndex < parts.length) {
        const part = parts[partIndex];
        if (offset < part.length) {
          const end = Math.min(offset + CHUNK, part.length);
          const chunk = part.subarray(offset, end);
          controller.enqueue(new Uint8Array(chunk));
          offset += chunk.length;
          sent += chunk.length;
          onProgress?.(sent, contentLength);
          return;
        }
        partIndex++;
        offset = 0;
      }
      controller.close();
    },
  });

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength,
  };
}

/** Upload a .3mf file to BambBuddy and return the archive_id. */
export async function uploadArchive(
  filename: string,
  fileBuffer: Buffer,
  onProgress?: (sent: number, total: number) => void,
): Promise<number> {
  const { endpoint } = getConfig();
  const bearer = await loginForBearer();

  const { body, contentType, contentLength } = makeMultipartStream(
    filename,
    fileBuffer,
    onProgress,
  );

  // 85s keeps us under Cloudflare's 100s proxy timeout so callers get a real
  // 502 error rather than a silent CF 524.
  const res = await fetch(`${endpoint}/api/v1/archives/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
    body,
    signal: AbortSignal.timeout(85_000),
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

export async function clearBambuddyBuildPlate(
  printerId: number,
): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/printers/${printerId}/clear-plate`,
    {
      method: "POST",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await checkResponse(res, "clear build plate");
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

export interface FilamentOverride {
  slot_id: number;
  type: string;
  color: string;
  color_name: string;
  force_color_match: boolean;
}

export interface PrintQueueItemUpdate {
  filament_overrides?: FilamentOverride[] | null;
  ams_mapping?: number[] | null;
  printer_id?: number | null;
  target_model?: string | null;
  target_location?: string | null;
  manual_start?: boolean;
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
}

export interface PrintQueueItemCreate {
  archive_id?: number | null;
  library_file_id?: number | null;
  printer_id?: number | null;
  target_model?: string | null;
  target_location?: string | null;
  required_filament_types?: string[] | null;
  filament_overrides?: FilamentOverride[] | null;
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
  filament_overrides: FilamentOverride[] | null;
  waiting_reason: string | null;
  archive_id: number | null;
  library_file_id: number | null;
  position: number;
  scheduled_time: string | null;
  require_previous_success: boolean;
  auto_off_after: boolean;
  manual_start: boolean;
  filament_short: boolean;
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
  archive_deleted: boolean;
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
  sliced_for_model: string | null;
  created_at: string;
}

// ─── Queue API ────────────────────────────────────────────────────────────────

// In-flight coalescing for listQueue: concurrent callers with the same params
// share a single HTTP request instead of hammering Bambuddy in parallel.
const listQueueInflight = new Map<string, Promise<PrintQueueItemResponse[]>>();

export async function listQueue(opts?: {
  printerId?: number;
  status?: string;
}): Promise<PrintQueueItemResponse[]> {
  const cacheKey = `${opts?.printerId ?? ""}:${opts?.status ?? ""}`;

  const existing = listQueueInflight.get(cacheKey);
  if (existing) return existing;

  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.printerId != null) params.set("printer_id", String(opts.printerId));
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString();

  const promise = fetch(`${endpoint}/api/v1/queue/${qs ? `?${qs}` : ""}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      await checkResponse(res, "list queue");
      return res.json() as Promise<PrintQueueItemResponse[]>;
    })
    .finally(() => {
      listQueueInflight.delete(cacheKey);
    });

  listQueueInflight.set(cacheKey, promise);
  return promise;
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

export async function getQueueItem(
  itemId: number,
): Promise<PrintQueueItemResponse | null> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  await checkResponse(res, "get queue item");
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

export async function updateQueueItem(
  itemId: number,
  update: PrintQueueItemUpdate,
): Promise<PrintQueueItemResponse> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/queue/${itemId}`, {
    method: "PATCH",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "update queue item");
  return res.json() as Promise<PrintQueueItemResponse>;
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

// In-flight coalescing for listBambuddyPrinterStatuses
let listPrinterStatusesInflight: Promise<BambuddyPrinterStatus[]> | null = null;

/** Fetch status for all BamBuddy printers in parallel. Failed individual lookups are skipped. */
export async function listBambuddyPrinterStatuses(): Promise<
  BambuddyPrinterStatus[]
> {
  if (listPrinterStatusesInflight) return listPrinterStatusesInflight;

  const promise = (async () => {
    const printers = await listBambuddyPrinters();
    const results = await Promise.allSettled(
      printers.map((p) => getBambuddyPrinterStatus(p.id)),
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  })().finally(() => {
    listPrinterStatusesInflight = null;
  });

  listPrinterStatusesInflight = promise;
  return promise;
}

// ─── Print Stats Types ────────────────────────────────────────────────────────

export interface ArchiveStats {
  total_prints: number;
  successful_prints: number;
  failed_prints: number;
  total_print_time_hours: number;
  total_filament_grams: number;
  total_cost: number;
  prints_by_filament_type: Record<string, unknown>;
  prints_by_printer: Record<string, unknown>;
  average_time_accuracy: number | null;
  time_accuracy_by_printer: Record<string, unknown> | null;
  total_energy_kwh: number;
  total_energy_cost: number;
  energy_data_warming_up: boolean;
}

export interface PrintLogEntry {
  id: number;
  print_name: string | null;
  printer_name: string | null;
  printer_id: number | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  filament_type: string | null;
  filament_color: string | null;
  filament_used_grams: number | null;
  thumbnail_path: string | null;
  created_by_username: string | null;
  created_at: string;
}

export interface PrintLogResponse {
  items: PrintLogEntry[];
  total: number;
}

export interface SpoolUsageHistoryEntry {
  id: number;
  spool_id: number;
  printer_id: number | null;
  print_name: string | null;
  weight_used: number;
  percent_used: number;
  status: string;
  cost: number | null;
  created_at: string;
}

export interface FilamentCatalogEntry {
  id: number;
  name: string;
  type: string;
  brand: string | null;
  color: string | null;
  color_hex: string | null;
  cost_per_kg: number | null;
  density: number | null;
  print_temp_min: number | null;
  print_temp_max: number | null;
}

// ─── Print Stats API ──────────────────────────────────────────────────────────

export async function getArchiveStats(opts?: {
  dateFrom?: string;
  dateTo?: string;
  createdById?: number;
}): Promise<ArchiveStats> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.dateFrom) params.set("date_from", opts.dateFrom);
  if (opts?.dateTo) params.set("date_to", opts.dateTo);
  if (opts?.createdById != null)
    params.set("created_by_id", String(opts.createdById));
  const qs = params.toString();
  const res = await fetch(
    `${endpoint}/api/v1/archives/stats${qs ? `?${qs}` : ""}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) },
  );
  await checkResponse(res, "get archive stats");
  return res.json() as Promise<ArchiveStats>;
}

export async function getPrintLog(opts?: {
  search?: string;
  printerId?: number;
  createdByUsername?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<PrintLogResponse> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.search) params.set("search", opts.search);
  if (opts?.printerId != null) params.set("printer_id", String(opts.printerId));
  if (opts?.createdByUsername)
    params.set("created_by_username", opts.createdByUsername);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.dateFrom) params.set("date_from", opts.dateFrom);
  if (opts?.dateTo) params.set("date_to", opts.dateTo);
  params.set("limit", String(opts?.limit ?? 50));
  params.set("offset", String(opts?.offset ?? 0));
  const res = await fetch(
    `${endpoint}/api/v1/print-log/?${params.toString()}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) },
  );
  await checkResponse(res, "get print log");
  return res.json() as Promise<PrintLogResponse>;
}

export async function getAllUsageHistory(opts?: {
  printerId?: number;
  limit?: number;
}): Promise<SpoolUsageHistoryEntry[]> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams();
  if (opts?.printerId != null) params.set("printer_id", String(opts.printerId));
  params.set("limit", String(opts?.limit ?? 500));
  const res = await fetch(
    `${endpoint}/api/v1/inventory/usage?${params.toString()}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) },
  );
  await checkResponse(res, "get all usage history");
  return res.json() as Promise<SpoolUsageHistoryEntry[]>;
}

export async function getFilamentCatalog(): Promise<FilamentCatalogEntry[]> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/filament-catalog/`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "get filament catalog");
  return res.json() as Promise<FilamentCatalogEntry[]>;
}

export interface AmsSlotConfig {
  amsId: number;
  trayId: number;
  trayInfoIdx: string;
  trayType: string;
  traySubBrands: string;
  trayColor: string;
  nozzleTempMin: number;
  nozzleTempMax: number;
  nozzleDiameter?: string;
}

export async function configureAmsSlot(
  printerId: number,
  config: AmsSlotConfig,
): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const params = new URLSearchParams({
    tray_info_idx: config.trayInfoIdx,
    tray_type: config.trayType,
    tray_sub_brands: config.traySubBrands,
    tray_color: config.trayColor,
    nozzle_temp_min: String(config.nozzleTempMin),
    nozzle_temp_max: String(config.nozzleTempMax),
    nozzle_diameter: config.nozzleDiameter ?? "0.4",
  });
  const url = `${endpoint}/api/v1/printers/${printerId}/slots/${config.amsId}/${config.trayId}/configure?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  await checkResponse(res, "configure AMS slot");
}

export interface InventorySpool {
  id: number;
  material: string;
  subtype: string | null;
  color_name: string | null;
  rgba: string | null;
  brand: string | null;
  label_weight: number;
  weight_used: number;
  nozzle_temp_min: number | null;
  nozzle_temp_max: number | null;
  note: string | null;
  archived_at: string | null;
}

export interface BambuddySpoolAssignment {
  id: number;
  spool_id: number;
  printer_id: number;
  printer_name: string | null;
  ams_id: number;
  tray_id: number;
  spool: InventorySpool | null;
  configured: boolean;
  pending_config: boolean;
}

export async function getInventoryAssignments(
  printerId: number,
): Promise<BambuddySpoolAssignment[]> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/inventory/assignments?printer_id=${printerId}`,
    { headers: headers(apiKey), signal: AbortSignal.timeout(10_000) },
  );
  await checkResponse(res, "get inventory assignments");
  return res.json() as Promise<BambuddySpoolAssignment[]>;
}

export async function updateSpoolWeightUsed(
  spoolId: number,
  weightUsed: number,
): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/inventory/spools/${spoolId}`, {
    method: "PATCH",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ weight_used: weightUsed }),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "update spool weight");
}

export function getPrintLogThumbnailUrl(entryId: number): string {
  const { endpoint, apiKey } = getConfig();
  return `${endpoint}/api/v1/print-log/${entryId}/thumbnail?api_key=${encodeURIComponent(apiKey)}`;
}

export async function listInventorySpools(): Promise<InventorySpool[]> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/inventory/spools`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "list inventory spools");
  const data = await res.json();
  return Array.isArray(data) ? (data as InventorySpool[]) : [];
}

export async function getBambuddyCameraSnapshot(
  printerId: number,
  token: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { endpoint } = getConfig();
  let res: Response;
  try {
    res = await fetch(
      `${endpoint}/api/v1/printers/${printerId}/camera/snapshot?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  return { bytes, contentType };
}

export async function listFilamentTypes(): Promise<string[]> {
  const spools = await listInventorySpools();
  const fromSpools = spools
    .map((s) => s.material)
    .filter((m): m is string => Boolean(m));
  const merged = Array.from(
    new Set([
      ...fromSpools,
      "PLA",
      "PETG",
      "ABS",
      "ASA",
      "TPU",
      "PA",
      "PC",
      "PHA",
      "PLA-CF",
      "PA-CF",
      "PETG-CF",
    ]),
  );
  return merged.sort();
}

export interface SpoolCreateInput {
  material: string;
  brand?: string | null;
  color_name?: string | null;
  rgba?: string | null;
  nozzle_temp_min?: number | null;
  nozzle_temp_max?: number | null;
  label_weight?: number;
  weight_used?: number;
}

export async function createInventorySpool(
  data: SpoolCreateInput,
): Promise<InventorySpool> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/inventory/spools`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "create inventory spool");
  return res.json() as Promise<InventorySpool>;
}

export async function assignSpoolToSlot(opts: {
  spoolId: number;
  printerId: number;
  amsId: number;
  trayId: number;
}): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(`${endpoint}/api/v1/inventory/assignments`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      spool_id: opts.spoolId,
      printer_id: opts.printerId,
      ams_id: opts.amsId,
      tray_id: opts.trayId,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  await checkResponse(res, "assign spool to slot");
}

export async function unassignSpoolFromSlot(opts: {
  printerId: number;
  amsId: number;
  trayId: number;
}): Promise<void> {
  const { endpoint, apiKey } = getConfig();
  const res = await fetch(
    `${endpoint}/api/v1/inventory/assignments/${opts.printerId}/${opts.amsId}/${opts.trayId}`,
    {
      method: "DELETE",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await checkResponse(res, "unassign spool from slot");
}
