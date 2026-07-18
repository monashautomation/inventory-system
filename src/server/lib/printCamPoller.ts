import * as http from "node:http";
import {
  resolveBambuddyPrinterId,
  getBambuddyPrinterStatus,
  getBambuddyCameraSnapshot,
  getBambuddyStreamToken,
  listBambuddyPrinters,
  listQueue,
  type PrintQueueItemResponse,
} from "@/server/lib/bambuddy";
import { prisma } from "@/server/lib/prisma";
import {
  prusaStatusResponseSchema,
  prusaJobResponseSchema,
} from "@/server/lib/prusaSchemas";
import { resolveStartedBy } from "@/server/api/utils/print/print.utils";
import { logger as rootLogger } from "@/server/lib/logger";

const logger = rootLogger.child({ module: "printCam" });

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

// States for which a Bambu printer should show attribution.
// Idle/offline printers must not leak the previous user's name.
const BAMBU_ACTIVE_STATES = new Set([
  "PRINTING",
  "PAUSED",
  "BUSY",
  "FINISHED",
  "ATTENTION",
]);

// ─── In-memory caches ────────────────────────────────────────────────────────

// keyed by printerId
const statusCache = new Map<string, CachedPrinterStatus>();

export function getAllCachedStatuses(): CachedPrinterStatus[] {
  return Array.from(statusCache.values());
}

// ─── Snapshot cache ───────────────────────────────────────────────────────────

interface SnapshotEntry {
  bytes: Uint8Array;
  contentType: string;
  fetchedAt: number;
}

const snapshotCache = new Map<string, SnapshotEntry>();
// Maps our DB printerId → BamBuddy integer printer_id, populated during status polls
const bambuddyIdByPrinterId = new Map<string, number>();

export function getSnapshot(printerId: string): SnapshotEntry | null {
  return snapshotCache.get(printerId) ?? null;
}

// ─── BamBuddy stream token ────────────────────────────────────────────────────

let streamToken: string | null = null;
let streamTokenExpiresAt = 0;

async function getOrRefreshStreamToken(): Promise<string | null> {
  if (!process.env.BAMBUDDY_ENDPOINT || !process.env.BAMBUDDY_API_KEY)
    return null;
  if (streamToken && Date.now() < streamTokenExpiresAt) return streamToken;
  try {
    streamToken = await getBambuddyStreamToken();
    streamTokenExpiresAt = Date.now() + 55 * 60 * 1000; // 55 min (token valid 60)
    return streamToken;
  } catch {
    return null;
  }
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
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body,
          });
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

    const statusParsed = prusaStatusResponseSchema.safeParse(
      JSON.parse(statusResult.body),
    );
    if (!statusParsed.success) {
      logger.error(
        { ip: printer.ipAddress, issues: statusParsed.error.issues },
        "Prusa status response invalid",
      );
      return;
    }
    const status = statusParsed.data;

    let job = null;
    if (jobResult.status !== 204) {
      const jobParsed = prusaJobResponseSchema.safeParse(
        JSON.parse(jobResult.body),
      );
      if (!jobParsed.success) {
        logger.error(
          { ip: printer.ipAddress, issues: jobParsed.error.issues },
          "Prusa job response invalid",
        );
        return;
      }
      job = jobParsed.data;
    }

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
      timeRemaining:
        status.job?.time_remaining != null
          ? Math.ceil(status.job.time_remaining / 60)
          : job?.time_remaining != null
            ? Math.ceil(job.time_remaining / 60)
            : null,
      filamentType:
        job?.file?.meta?.filament_type ?? job?.file?.meta?.material ?? null,
      fileName: job?.file?.display_name ?? job?.file?.name ?? null,
      ...preservedAttribution(printer.id),
      updatedAt: Date.now(),
    });
  } catch (err) {
    logger.error(
      { printer: printer.name, ip: printer.ipAddress, err },
      "Prusa poll failed",
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

async function fetchBambuStatus(printer: {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  webcamUrl: string | null;
  authToken: string | null;
  serialNumber: string | null;
}): Promise<void> {
  const unreachable = (msg: string) => {
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "UNREACHABLE",
      stateMessage: msg,
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
  };

  let bambuddyId: number | null;
  try {
    bambuddyId = await resolveBambuddyPrinterId({
      ipAddress: printer.ipAddress,
      serialNumber: printer.serialNumber,
    });
  } catch {
    unreachable("Could not reach BamBuddy.");
    return;
  }

  if (bambuddyId === null) {
    statusCache.set(printer.id, {
      printerId: printer.id,
      printerName: printer.name,
      printerType: printer.type,
      ipAddress: printer.ipAddress,
      webcamUrl: printer.webcamUrl,
      state: "UNKNOWN",
      stateMessage: "Printer not found in BamBuddy.",
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

  // bambuddyId is narrowed to number here — store for snapshot polling
  bambuddyIdByPrinterId.set(printer.id, bambuddyId);

  let s: Awaited<ReturnType<typeof getBambuddyPrinterStatus>>;
  try {
    s = await getBambuddyPrinterStatus(bambuddyId);
  } catch {
    unreachable("Could not reach BamBuddy.");
    return;
  }

  if (!s.connected) {
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

  const rawState = (s.state ?? "IDLE").toUpperCase();
  const progressText =
    s.progress != null ? ` (${Math.round(s.progress)}%)` : "";

  let state: string;
  let stateMessage: string;
  switch (rawState) {
    case "RUNNING":
    case "PRINTING":
      state = "PRINTING";
      stateMessage = `Printing in progress${progressText}`;
      break;
    case "PAUSE":
    case "PAUSED":
      state = "PAUSED";
      stateMessage = "Paused";
      break;
    case "FINISH":
    case "FINISHED":
      state = "FINISHED";
      stateMessage = "Finished";
      break;
    case "FAILED":
      state = "IDLE";
      stateMessage = "Last print failed";
      break;
    case "PREPARE":
      state = "BUSY";
      stateMessage = "Preparing";
      break;
    case "IDLE":
    default:
      state = rawState === "IDLE" ? "IDLE" : rawState;
      stateMessage = rawState === "IDLE" ? "Ready" : rawState;
      break;
  }

  const temps = s.temperatures ?? {};
  statusCache.set(printer.id, {
    printerId: printer.id,
    printerName: printer.name,
    printerType: printer.type,
    ipAddress: printer.ipAddress,
    webcamUrl: printer.webcamUrl,
    state,
    stateMessage,
    nozzleTemp: temps.nozzle ?? null,
    targetNozzleTemp: temps.target_nozzle ?? null,
    bedTemp: temps.bed ?? null,
    targetBedTemp: temps.target_bed ?? null,
    chamberTemp: temps.chamber ?? null,
    progress: s.progress ?? null,
    timeRemaining: s.remaining_time ?? null,
    filamentType: null,
    fileName: s.subtask_name ?? s.current_print ?? s.gcode_file ?? null,
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

// Self-healing cleanup for pre-existing duplicate rows (e.g. from an IP
// change that predates the serial-matching fix below). Idempotent — no-op
// once every serial has a single row. Keeps the most recently updated row
// per serial, migrates job history off the stale rows, then deletes them.
async function dedupeBambuPrintersBySerial(): Promise<void> {
  const printers = await prisma.printer.findMany({
    where: { type: "BAMBU", serialNumber: { not: null } },
    orderBy: { updatedAt: "desc" },
  });

  const groups = new Map<string, typeof printers>();
  for (const p of printers) {
    const serial = p.serialNumber!;
    const group = groups.get(serial);
    if (group) group.push(p);
    else groups.set(serial, [p]);
  }

  for (const [serial, group] of groups) {
    if (group.length < 2) continue;
    const [keeper, ...stale] = group;
    const webcamUrl =
      keeper.webcamUrl ?? stale.find((s) => s.webcamUrl)?.webcamUrl ?? null;
    const authToken =
      keeper.authToken ?? stale.find((s) => s.authToken)?.authToken ?? null;

    try {
      await prisma.$transaction([
        prisma.printer.update({
          where: { id: keeper.id },
          data: { webcamUrl, authToken },
        }),
        ...stale.map((s) =>
          prisma.gcodePrintJob.updateMany({
            where: { printerId: s.id },
            data: { printerId: keeper.id },
          }),
        ),
        prisma.printer.deleteMany({
          where: { id: { in: stale.map((s) => s.id) } },
        }),
      ]);
      logger.info(
        { serial, keeper: keeper.id, merged: stale.map((s) => s.id) },
        "Merged duplicate printer rows",
      );
    } catch (err) {
      logger.error({ serial, err }, "Failed to dedupe printer rows");
    }
  }
}

export async function syncBambuPrinters(): Promise<void> {
  if (!process.env.BAMBUDDY_ENDPOINT || !process.env.BAMBUDDY_API_KEY) return;

  let buddyPrinters: Awaited<ReturnType<typeof listBambuddyPrinters>>;
  try {
    buddyPrinters = await listBambuddyPrinters();
  } catch {
    return;
  }
  if (buddyPrinters.length === 0) return;

  const systemUser =
    (await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ select: { id: true } }));
  if (!systemUser) return;

  await dedupeBambuPrintersBySerial();

  const existingBambuPrinters = await prisma.printer.findMany({
    where: { type: "BAMBU" },
  });
  const existingBySerial = new Map(
    existingBambuPrinters
      .filter((p) => p.serialNumber)
      .map((p) => [p.serialNumber!, p]),
  );

  await Promise.allSettled(
    buddyPrinters
      .filter((p) => !!p.ip_address)
      .map((p) => {
        // Match by serial number first — a printer's IP can change (DHCP,
        // server migration) without its serial changing. Falling back to
        // ipAddress-only upsert would create a duplicate row per IP change.
        const existing = p.serial_number
          ? existingBySerial.get(p.serial_number)
          : undefined;

        if (existing) {
          return prisma.printer.update({
            where: { id: existing.id },
            data: {
              name: p.name,
              ipAddress: p.ip_address,
              serialNumber: p.serial_number || null,
            },
          });
        }

        return prisma.printer.upsert({
          where: { ipAddress: p.ip_address },
          update: {
            name: p.name,
            serialNumber: p.serial_number || null,
          },
          create: {
            name: p.name,
            type: "BAMBU",
            ipAddress: p.ip_address,
            serialNumber: p.serial_number || null,
            createdByUserId: systemUser.id,
          },
        });
      }),
  );
}

async function refreshPrinterListCache(): Promise<void> {
  await syncBambuPrinters().catch((err) =>
    logger.error({ err }, "Bambu sync failed"),
  );
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
    logger.warn("Poll cycle stuck — forcing reset");
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
        logger.error({ err }, "Printer list refresh failed");
      });
    }
    if (printerListCache.length === 0) return;

    await Promise.allSettled(
      printerListCache.map((p) =>
        p.type === "BAMBU" ? fetchBambuStatus(p) : fetchPrusaStatus(p),
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

    const bambuPrinterIds: string[] = [];
    const prusaPrinterIds: string[] = [];
    for (const printerId of printerIds) {
      if (bambuddyIdByPrinterId.has(printerId)) {
        bambuPrinterIds.push(printerId);
      } else {
        prusaPrinterIds.push(printerId);
      }
    }

    const bambuddyIds = bambuPrinterIds
      .map((id) => bambuddyIdByPrinterId.get(id)!)
      .filter((id) => id != null);

    // Fetch: (1) Bambuddy active queue items, (2) Prusa jobs, (3) completed Bambu submissions
    const [activeQueueItems, recentJobs, completedQueueSubs] =
      await Promise.all([
        bambuddyIds.length > 0
          ? listQueue({ status: "printing" }).catch(
              (): PrintQueueItemResponse[] => [],
            )
          : Promise.resolve([] as PrintQueueItemResponse[]),
        prusaPrinterIds.length > 0
          ? prisma.gcodePrintJob.findMany({
              where: {
                printerId: { in: prusaPrinterIds },
                status: "DISPATCHED",
              },
              orderBy: { createdAt: "desc" },
              include: { user: { select: { name: true, email: true } } },
              take: prusaPrinterIds.length * 3,
            })
          : Promise.resolve([]),
        bambuddyIds.length > 0
          ? prisma.printQueueSubmission.findMany({
              where: {
                capturedPrinterId: { in: bambuddyIds },
                capturedStatus: { not: null },
              },
              orderBy: { capturedStartedAt: "desc" },
              select: {
                capturedPrinterId: true,
                user: { select: { name: true, email: true } },
              },
              take: bambuddyIds.length * 3,
            })
          : Promise.resolve([]),
      ]);

    // Map: bambuddyPrinterId → active queue item ID (the item currently printing)
    const activePrinterToQueueItemId = new Map<number, number>();
    for (const item of activeQueueItems) {
      if (
        item.printer_id != null &&
        !activePrinterToQueueItemId.has(item.printer_id)
      ) {
        activePrinterToQueueItemId.set(item.printer_id, item.id);
      }
    }

    // Fetch our submissions for those active queue item IDs to get the releaser
    const activeQueueItemIds = [...activePrinterToQueueItemId.values()];
    const activeSubmissions =
      activeQueueItemIds.length > 0
        ? await prisma.printQueueSubmission.findMany({
            where: { bambuddyQueueItemId: { in: activeQueueItemIds } },
            select: {
              bambuddyQueueItemId: true,
              user: { select: { name: true, email: true } },
            },
          })
        : [];

    // Map: queue item ID → user (the person who released the print from our queue)
    const releaserByQueueItemId = new Map<
      number,
      { name: string; email: string }
    >();
    for (const sub of activeSubmissions) {
      releaserByQueueItemId.set(sub.bambuddyQueueItemId, sub.user);
    }

    // Fallback map for FINISHED state: most recent completed submission per printer
    const completedUserByBambuddyId = new Map<
      number,
      { name: string; email: string }
    >();
    for (const sub of completedQueueSubs) {
      if (
        sub.capturedPrinterId !== null &&
        !completedUserByBambuddyId.has(sub.capturedPrinterId)
      ) {
        completedUserByBambuddyId.set(sub.capturedPrinterId, sub.user);
      }
    }

    const jobByPrinter = new Map<string, (typeof recentJobs)[number]>();
    for (const job of recentJobs) {
      if (!jobByPrinter.has(job.printerId)) {
        jobByPrinter.set(job.printerId, job);
      }
    }

    for (const [printerId, entry] of statusCache) {
      const bambuddyId = bambuddyIdByPrinterId.get(printerId);
      const isBambu = bambuddyId !== undefined;

      if (isBambu) {
        const isActive = BAMBU_ACTIVE_STATES.has(entry.state.toUpperCase());
        if (!isActive) {
          statusCache.set(printerId, {
            ...entry,
            startedBy: null,
            jobStartedAt: null,
          });
          continue;
        }
        // Prefer live queue attribution (active print), fall back to last completed (FINISHED)
        const activeQueueItemId =
          bambuddyId !== undefined
            ? activePrinterToQueueItemId.get(bambuddyId)
            : undefined;
        const releaser =
          (activeQueueItemId !== undefined
            ? releaserByQueueItemId.get(activeQueueItemId)
            : undefined) ??
          (bambuddyId !== undefined
            ? completedUserByBambuddyId.get(bambuddyId)
            : undefined) ??
          null;
        statusCache.set(printerId, {
          ...entry,
          startedBy: resolveStartedBy(releaser, entry.fileName),
          jobStartedAt: null,
        });
      } else {
        const job = jobByPrinter.get(printerId);
        const fallback = job
          ? { name: job.user.name, email: job.user.email }
          : null;
        statusCache.set(printerId, {
          ...entry,
          startedBy: resolveStartedBy(fallback, entry.fileName),
          jobStartedAt: job?.createdAt ?? null,
        });
      }
    }
  } finally {
    attributionPollRunning = false;
  }
}

// ─── Snapshot polling ─────────────────────────────────────────────────────────

const SNAPSHOT_TIMEOUT_MS = 8_000;
let snapshotPollRunning = false;

async function pollAllSnapshots(): Promise<void> {
  if (snapshotPollRunning) return;
  snapshotPollRunning = true;
  try {
    const printers = printerListCache;
    if (printers.length === 0) return;

    const token = await getOrRefreshStreamToken();

    await Promise.allSettled(
      printers.map(async (p) => {
        if (p.type === "BAMBU") {
          if (!token) return;
          const bambuddyId = bambuddyIdByPrinterId.get(p.id);
          if (!bambuddyId) return;
          const result = await getBambuddyCameraSnapshot(bambuddyId, token);
          if (result) {
            snapshotCache.set(p.id, {
              bytes: result.bytes,
              contentType: result.contentType,
              fetchedAt: Date.now(),
            });
          }
        } else if (p.webcamUrl) {
          const snapshotUrl = p.webcamUrl.includes("action=stream")
            ? p.webcamUrl.replace("action=stream", "action=snapshot")
            : p.webcamUrl;
          let res: Response;
          try {
            res = await fetch(snapshotUrl, {
              signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
              headers: { Accept: "image/*,*/*" },
            });
          } catch {
            return;
          }
          if (!res.ok) return;
          const bytes = new Uint8Array(await res.arrayBuffer());
          const contentType = res.headers.get("content-type") ?? "image/jpeg";
          snapshotCache.set(p.id, {
            bytes,
            contentType,
            fetchedAt: Date.now(),
          });
        }
      }),
    );
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
  setInterval(() => void pollAllStatuses(), 10_000);
  setInterval(() => void pollAttribution(), 30_000);
  // Snapshots on a tighter cycle for live dashboard feel; runs after first status
  // poll has a chance to populate printerListCache and bambuddyIdByPrinterId.
  setTimeout(() => {
    void pollAllSnapshots();
    setInterval(() => void pollAllSnapshots(), 5_000);
  }, 3_000);
}

export async function refreshPrintCamCache(): Promise<void> {
  await Promise.allSettled([
    pollAllStatuses(),
    pollAttribution(),
    pollAllSnapshots(),
  ]);
}
