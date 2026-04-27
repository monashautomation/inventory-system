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

// ─── Timeout-safe fetch ───────────────────────────────────────────────────────
// AbortSignal.timeout() only covers connection time in some runtimes — it may
// not fire once the response body starts streaming.  This wrapper uses a manual
// AbortController so the signal fires at the wall-clock deadline regardless of
// which phase the fetch is in.

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ac.signal }).finally(() =>
    clearTimeout(timer),
  );
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

  const headers = { "X-Api-Key": printer.authToken };

  try {
    const [statusRes, jobRes] = await Promise.all([
      fetchWithTimeout(
        `http://${printer.ipAddress}/api/v1/status`,
        { headers },
        PRUSA_TIMEOUT_MS,
      ),
      fetchWithTimeout(
        `http://${printer.ipAddress}/api/v1/job`,
        { headers },
        PRUSA_TIMEOUT_MS,
      ),
    ]);

    if (!statusRes.ok) {
      statusCache.set(printer.id, {
        printerId: printer.id,
        printerName: printer.name,
        printerType: printer.type,
        ipAddress: printer.ipAddress,
        webcamUrl: printer.webcamUrl,
        state: "UNREACHABLE",
        stateMessage: `Status check failed (HTTP ${statusRes.status}).`,
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

    const status = (await statusRes.json()) as PrusaStatusResponse;
    const job =
      jobRes.status === 204
        ? null
        : ((await jobRes.json()) as PrusaJobResponse);

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
      stateMessage:
        state === "PRINTING"
          ? `Printing in progress${progressText}`
          : state === "IDLE" || state === "READY" || state === "FINISHED"
            ? "Ready"
            : state,
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
  } catch {
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
      stateMessage = consumeUserCancelled(printer.serialNumber)
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

let statusPollRunning = false;

async function pollAllStatuses(): Promise<void> {
  if (statusPollRunning) return;
  statusPollRunning = true;
  try {
    const printers = await prisma.printer.findMany();
    // Bambu: synchronous read from MQTT cache. Prusa: HTTP with explicit timeout.
    await Promise.allSettled(
      printers.map((p) =>
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

const SNAPSHOT_TIMEOUT_MS = 15_000;

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
    await reader.cancel().catch(() => {});
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

  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: "*/*" } },
      SNAPSHOT_TIMEOUT_MS,
    );
    if (!res.ok || !res.body) return;

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("multipart")) {
      // Pull one JPEG frame out of the MJPEG stream so the client gets a
      // real snapshot rather than a permanently-missing entry.
      const frame = await extractMjpegFrame(res.body);
      snapshotCache.set(
        printer.id,
        frame
          ? { data: frame, contentType: "image/jpeg", fetchedAt: Date.now() }
          : null,
      );
      return;
    }

    // fetchWithTimeout's AbortController covers body reads too — safe to await
    const data = Buffer.from(await res.arrayBuffer());
    snapshotCache.set(printer.id, {
      data,
      contentType: contentType || "image/jpeg",
      fetchedAt: Date.now(),
    });
  } catch {
    // Leave existing cache entry intact on transient failure
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
  setInterval(() => void pollAllSnapshots(), 15_000);
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
