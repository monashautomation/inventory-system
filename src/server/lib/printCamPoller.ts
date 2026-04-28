import * as http from "node:http";
import { getBambuStatus, consumeUserCancelled } from "@/server/lib/bambu";
import { prisma } from "@/server/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedPrinterStatus {
  printerId: string;
  printerName: string;
  printerType: string;
  ipAddress: string;
  webcamUrl: string | null;
  state: string;
  stateMessage: string;
  nozzleTemp: number | null;
  targetNozzleTemp: number | null;
  bedTemp: number | null;
  targetBedTemp: number | null;
  chamberTemp: number | null;
  progress: number | null;
  timeRemaining: number | null;
  filamentType: string | null;
  fileName: string | null;
  startedBy: { name: string; email: string } | null;
  jobStartedAt: Date | null;
  updatedAt: number;
}

export interface CachedSnapshot {
  data: Buffer;
  contentType: string;
  fetchedAt: number;
}

// ─── In-memory caches ────────────────────────────────────────────────────────

// keyed by printerId
const statusCache = new Map<string, CachedPrinterStatus>();
// keyed by printerId; null = live MJPEG (can't cache); undefined (missing) = not yet polled
const snapshotCache = new Map<string, CachedSnapshot | null>();

export function getAllCachedStatuses(): CachedPrinterStatus[] {
  return Array.from(statusCache.values());
}

export function getCachedSnapshot(
  printerId: string,
): CachedSnapshot | null | undefined {
  return snapshotCache.get(printerId);
}

export function getCachedWebcamUrl(printerId: string): string | null {
  return statusCache.get(printerId)?.webcamUrl ?? null;
}

// ─── Prusa HTTP helper (no connection pooling) ────────────────────────────────
// Bun's fetch maintains a persistent connection pool per origin. After long
// server uptime these pooled connections silently die (NAT/firewall timeout),
// and Bun may keep retrying them, causing every Prusa poll to fail.
// Using node:http with agent:false forces a fresh TCP socket per request,
// mirroring the periodic force-reconnect used for Bambu MQTT connections.

interface PrusaHttpResult {
  ok: boolean;
  status: number;
  body: string;
}

function prusaHttpGet(
  ipAddress: string,
  path: string,
  authToken: string,
  timeoutMs: number,
): Promise<PrusaHttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: ipAddress,
        port: 80,
        path,
        method: "GET",
        headers: { "X-Api-Key": authToken, Connection: "close" },
        agent: false, // No connection pooling — fresh TCP socket every request
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body });
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Prusa request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── State message helpers ───────────────────────────────────────────────────

function prusaStateMessage(state: string, progressText = ""): string {
  switch (state.toUpperCase()) {
    case "PRINTING":
      return `Printing in progress${progressText}`;
    case "IDLE":
    case "READY":
    case "FINISHED":
      return "Ready";
    case "PAUSED":
      return "Paused";
    case "ATTENTION":
      return "Printer needs attention — check display";
    case "ERROR":
      return "Printer error — check display";
    case "STOPPED":
      return "Print stopped";
    case "BUSY":
      return "Printer is busy";
    default:
      return state;
  }
}

// ─── Status polling ──────────────────────────────────────────────────────────

const PRUSA_TIMEOUT_MS = 8_000;

// Preserve startedBy/jobStartedAt from existing cache entry across status refreshes —
// these are updated separately in pollAllStatuses after all network calls complete.
function preservedAttribution(
  id: string,
): Pick<CachedPrinterStatus, "startedBy" | "jobStartedAt"> {
  const existing = statusCache.get(id);
  return {
    startedBy: existing?.startedBy ?? null,
    jobStartedAt: existing?.jobStartedAt ?? null,
  };
}

async function fetchPrusaStatus(printer: {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  webcamUrl: string | null;
  authToken: string | null;
}): Promise<void> {
  if (!printer.authToken) {
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "UNKNOWN",
      stateMessage: "No auth token configured.",
      nozzleTemp: null,
      targetNozzleTemp: null,
      bedTemp: null,
      targetBedTemp: null,
      chamberTemp: null,
      progress: null,
      timeRemaining: null,
      filamentType: null,
      fileName: null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
    return;
  }

  interface PrusaStatusResponse {
    printer?: {
      state?: string;
      temp_nozzle?: number;
      target_nozzle?: number;
      temp_bed?: number;
      target_bed?: number;
    };
    job?: { progress?: number; time_remaining?: number };
  }
  interface PrusaJobResponse {
    progress?: number;
    time_remaining?: number;
    file?: {
      name?: string;
      display_name?: string;
      meta?: { filament_type?: string; material?: string };
    };
  }

  try {
    const [statusResult, jobResult] = await Promise.all([
      prusaHttpGet(
        printer.ipAddress,
        "/api/v1/status",
        printer.authToken,
        PRUSA_TIMEOUT_MS,
      ),
      prusaHttpGet(
        printer.ipAddress,
        "/api/v1/job",
        printer.authToken,
        PRUSA_TIMEOUT_MS,
      ),
    ]);

    if (!statusResult.ok) {
      statusCache.set(printer.id, {
        printerId: printer.id,
        printerName: printer.name,
        printerType: printer.type,
        ipAddress: printer.ipAddress,
        webcamUrl: printer.webcamUrl,
        state: "UNREACHABLE",
        stateMessage: `Status check failed (HTTP ${statusResult.status}).`,
        nozzleTemp: null,
        targetNozzleTemp: null,
        bedTemp: null,
        targetBedTemp: null,
        chamberTemp: null,
        progress: null,
        timeRemaining: null,
        filamentType: null,
        fileName: null,
        ...preservedAttribution(printer.id),
        updatedAt: Date.now(),
      });
      return;
    }

    const status = JSON.parse(statusResult.body) as PrusaStatusResponse;
    const job =
      jobResult.status === 204
        ? null
        : (JSON.parse(jobResult.body) as PrusaJobResponse);

    const state = status.printer?.state?.trim() ?? "UNKNOWN";
    const progressValue = status.job?.progress ?? job?.progress ?? null;
    const progressText =
      progressValue != null ? ` (${Math.round(progressValue)}%)` : "";

    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state,
      stateMessage: prusaStateMessage(state, progressText),
      nozzleTemp: status.printer?.temp_nozzle ?? null,
      targetNozzleTemp: status.printer?.target_nozzle ?? null,
      bedTemp: status.printer?.temp_bed ?? null,
      targetBedTemp: status.printer?.target_bed ?? null,
      chamberTemp: null,
      progress: progressValue,
      timeRemaining: status.job?.time_remaining ?? job?.time_remaining ?? null,
      filamentType:
        job?.file?.meta?.filament_type ?? job?.file?.meta?.material ?? null,
      fileName: job?.file?.display_name ?? job?.file?.name ?? null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error(
      `[printCam] Prusa poll failed for ${printer.name} (${printer.ipAddress}):`,
      err instanceof Error ? err.message : err,
    );
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "UNREACHABLE",
      stateMessage: "Could not reach printer.",
      nozzleTemp: null,
      targetNozzleTemp: null,
      bedTemp: null,
      targetBedTemp: null,
      chamberTemp: null,
      progress: null,
      timeRemaining: null,
      filamentType: null,
      fileName: null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
  }
}

function fetchBambuStatus(printer: {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  webcamUrl: string | null;
  authToken: string | null;
  serialNumber: string | null;
}): void {
  if (!printer.authToken || !printer.serialNumber) {
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "UNKNOWN",
      stateMessage: "Bambu printer requires an access code and serial number.",
      nozzleTemp: null,
      targetNozzleTemp: null,
      bedTemp: null,
      targetBedTemp: null,
      chamberTemp: null,
      progress: null,
      timeRemaining: null,
      filamentType: null,
      fileName: null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
    return;
  }

  const bambuStatus = getBambuStatus(
    printer.ipAddress,
    printer.authToken,
    printer.serialNumber,
  );

  if (!bambuStatus) {
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "CONNECTING",
      stateMessage: "Connecting to Bambu printer…",
      nozzleTemp: null,
      targetNozzleTemp: null,
      bedTemp: null,
      targetBedTemp: null,
      chamberTemp: null,
      progress: null,
      timeRemaining: null,
      filamentType: null,
      fileName: null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
    return;
  }

  const gcodeState = bambuStatus.gcodeState.toUpperCase();
  const progressText =
    bambuStatus.progress != null
      ? ` (${Math.round(bambuStatus.progress)}%)`
      : "";

  let state: string;
  let stateMessage: string;
  switch (gcodeState) {
    case "RUNNING":
      state = "PRINTING";
      stateMessage = `Printing in progress${progressText}`;
      break;
    case "PAUSE":
      state = "PAUSED";
      stateMessage = "Paused";
      break;
    case "FINISH":
      state = "FINISHED";
      stateMessage = "Finished";
      break;
    case "FAILED":
      state = "IDLE";
      stateMessage =
        consumeUserCancelled(printer.serialNumber) ||
        statusCache.get(printer.id)?.stateMessage === "Cancelled"
          ? "Cancelled"
          : "Last print failed";
      break;
    case "PREPARE":
      state = "BUSY";
      stateMessage = "Preparing";
      break;
    case "IDLE":
    default:
      state = gcodeState === "IDLE" ? "IDLE" : gcodeState;
      stateMessage = gcodeState === "IDLE" ? "Ready" : gcodeState;
      break;
  }

  statusCache.set(printer.id, {
    printerId: printer.id,
    printerName: printer.name,
    printerType: printer.type,
    ipAddress: printer.ipAddress,
    webcamUrl: printer.webcamUrl,
    state,
    stateMessage,
    nozzleTemp: bambuStatus.nozzleTemp,
    targetNozzleTemp: bambuStatus.targetNozzleTemp,
    bedTemp: bambuStatus.bedTemp,
    targetBedTemp: bambuStatus.targetBedTemp,
    chamberTemp: bambuStatus.chamberTemp,
    progress: bambuStatus.progress,
    timeRemaining:
      bambuStatus.remainingTimeMinutes != null
        ? bambuStatus.remainingTimeMinutes * 60
        : null,
    filamentType: bambuStatus.filamentType ?? null,
    fileName: bambuStatus.fileName,
    ...preservedAttribution(printer.id),
    updatedAt: Date.now(),
  });
}

// ─── Status polling ───────────────────────────────────────────────────────────

const PRINTER_LIST_TTL_MS = 60_000;
const STATUS_POLL_STUCK_MS = 30_000;

let printerListCache: Awaited<ReturnType<typeof prisma.printer.findMany>> = [];
let printerListFetchedAt = 0;
let statusPollRunning = false;
let statusPollStartedAt = 0;

async function refreshPrinterListCache(): Promise<void> {
  const fresh = await Promise.race([
    prisma.printer.findMany(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("[printCam] printer list query timeout")),
        15_000,
      ),
    ),
  ]);
  printerListCache = fresh;
  printerListFetchedAt = Date.now();
}

async function pollAllStatuses(): Promise<void> {
  // Safety: reset a poll cycle that has been stuck longer than expected
  if (statusPollRunning) {
    if (Date.now() - statusPollStartedAt < STATUS_POLL_STUCK_MS) return;
    console.warn("[printCam] Poll cycle stuck — forcing reset");
    statusPollRunning = false;
  }
  statusPollRunning = true;
  statusPollStartedAt = Date.now();
  try {
    // Refresh printer list on a slower cadence to avoid hammering the DB
    if (
      printerListCache.length === 0 ||
      Date.now() - printerListFetchedAt > PRINTER_LIST_TTL_MS
    ) {
      await refreshPrinterListCache().catch((err) => {
        console.error("[printCam] Printer list refresh failed:", err);
      });
    }
    if (printerListCache.length === 0) return;

    // Bambu: synchronous read from MQTT cache. Prusa: HTTP with explicit timeout.
    await Promise.allSettled(
      printerListCache.map((p) =>
        p.type === "BAMBU"
          ? Promise.resolve(fetchBambuStatus(p))
          : fetchPrusaStatus(p),
      ),
    );
  } finally {
    statusPollRunning = false;
  }
}

// ─── Attribution polling (separate loop) ────────────────────────────────────
// Kept completely separate from status polling so a slow/hanging Prisma query
// cannot block status updates or hold statusPollRunning = true indefinitely.

let attributionPollRunning = false;

async function pollAttribution(): Promise<void> {
  if (attributionPollRunning) return;
  attributionPollRunning = true;
  try {
    const printerIds = Array.from(statusCache.keys());
    if (printerIds.length === 0) return;

    const recentJobs = await prisma.gcodePrintJob.findMany({
      where: { printerId: { in: printerIds }, status: "DISPATCHED" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: printerIds.length * 3,
    });

    const jobByPrinter = new Map<string, (typeof recentJobs)[number]>();
    for (const job of recentJobs) {
      if (!jobByPrinter.has(job.printerId)) {
        jobByPrinter.set(job.printerId, job);
      }
    }

    for (const [printerId, entry] of statusCache) {
      const job = jobByPrinter.get(printerId);
      statusCache.set(printerId, {
        ...entry,
        startedBy: job ? { name: job.user.name, email: job.user.email } : null,
        jobStartedAt: job?.createdAt ?? null,
      });
    }
  } finally {
    attributionPollRunning = false;
  }
}

// ─── Snapshot polling ─────────────────────────────────────────────────────────

const SNAPSHOT_TIMEOUT_MS = 8_000;

// Extract the first JPEG frame from an MJPEG multipart stream.
// Scans up to MAX_SCAN bytes for FF D8 FF (SOI) … FF D9 (EOI) markers.
// The AbortController from fetchWithTimeout ensures the read terminates.
async function extractMjpegFrame(
  body: ReadableStream<Uint8Array>,
): Promise<Buffer | null> {
  const MAX_SCAN = 512 * 1024;
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_SCAN) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      totalBytes += chunk.length;

      const combined = Buffer.concat(chunks);
      const soi = combined.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      if (soi < 0) continue;
      const eoi = combined.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
      if (eoi < 0) continue;
      return combined.subarray(soi, eoi + 2);
    }
    return null;
  } finally {
    await reader.cancel().catch(() => {
      /* empty */
    });
  }
}

async function pollSnapshot(printer: {
  id: string;
  webcamUrl: string;
}): Promise<void> {
  let url = printer.webcamUrl;
  if (url.includes("action=stream")) {
    url = url.replace("action=stream", "action=snapshot");
  }
  url += (url.includes("?") ? "&" : "?") + `_t=${Date.now()}`;

  // Single AbortController covers the entire operation — headers AND body reads.
  // fetchWithTimeout clears its timer after headers arrive, leaving MJPEG body
  // reads and arrayBuffer() uncovered. A hanging body read would keep
  // snapshotPollRunning=true indefinitely, silently blocking all future polls.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SNAPSHOT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "*/*", "Cache-Control": "no-cache" },
    });
    if (!res.ok || !res.body) return;

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("multipart")) {
      const frame = await extractMjpegFrame(res.body);
      snapshotCache.set(
        printer.id,
        frame
          ? { data: frame, contentType: "image/jpeg", fetchedAt: Date.now() }
          : null,
      );
      return;
    }

    const data = Buffer.from(await res.arrayBuffer());
    snapshotCache.set(printer.id, {
      data,
      contentType: contentType || "image/jpeg",
      fetchedAt: Date.now(),
    });
  } catch {
    // Leave existing cache entry intact on transient failure
  } finally {
    clearTimeout(timer);
  }
}

// Read webcam URLs from the status cache instead of hitting Prisma again
let snapshotPollRunning = false;

async function pollAllSnapshots(): Promise<void> {
  if (snapshotPollRunning) return;
  snapshotPollRunning = true;
  try {
    const printers = getAllCachedStatuses().filter(
      (s) => s.webcamUrl != null,
    ) as (CachedPrinterStatus & { webcamUrl: string })[];

    // If status cache is cold (server just started), fall back to DB
    const targets =
      printers.length > 0
        ? printers.map((p) => ({ id: p.printerId, webcamUrl: p.webcamUrl }))
        : await prisma.printer
            .findMany({
              where: { webcamUrl: { not: null } },
              select: { id: true, webcamUrl: true },
            })
            .then((rows) =>
              rows
                .filter((r) => r.webcamUrl != null)
                .map((r) => ({ id: r.id, webcamUrl: r.webcamUrl! })),
            );

    await Promise.allSettled(targets.map((p) => pollSnapshot(p)));
  } finally {
    snapshotPollRunning = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let started = false;

export function initPrintCamPoller(): void {
  if (started) return;
  started = true;

  void pollAllStatuses();
  void pollAllSnapshots();

  setInterval(() => void pollAllStatuses(), 10_000);
  setInterval(() => void pollAllSnapshots(), 5_000);
  // Attribution runs less frequently; isolated so DB hangs can't block status
  setInterval(() => void pollAttribution(), 30_000);
}

export async function refreshPrintCamCache(): Promise<void> {
  await Promise.allSettled([
    pollAllStatuses(),
    pollAllSnapshots(),
    pollAttribution(),
  ]);
}
