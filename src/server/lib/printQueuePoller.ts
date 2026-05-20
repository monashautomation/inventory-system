import { prisma } from "@/server/lib/prisma";
import { getQueueItem, getPrintLog } from "@/server/lib/bambuddy";
import { logger } from "@/server/lib/logger";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "skipped",
]);

// Queue IDs recycle when the queue is cleared. If the item's created_at in
// Bambuddy differs from what we recorded by more than this threshold, the ID
// was reused for a different job and our original record is gone.
const ID_RECYCLE_THRESHOLD_MS = 5 * 60 * 1000;

// Don't mark a submission as "missed" until it's at least this old. Gives
// Bambuddy time to create the queue item before we start polling.
const MISS_GRACE_PERIOD_MS = 10 * 60 * 1000;

let polling = false;

export async function pollPrintQueueStats(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    await runPoll();
  } finally {
    polling = false;
  }
}

async function runPoll(): Promise<void> {
  const pending = await prisma.printQueueSubmission.findMany({
    where: { capturedStatus: null },
    select: {
      id: true,
      bambuddyQueueItemId: true,
      bambuddyQueueCreatedAt: true,
      createdAt: true,
    },
  });

  if (pending.length === 0) return;

  logger.debug(
    { count: pending.length },
    "Polling queue stats for pending submissions",
  );

  for (const submission of pending) {
    try {
      const item = await getQueueItem(submission.bambuddyQueueItemId);

      if (!item) {
        // Item not found — purged after completion or ID recycled.
        // Only mark as missed after the grace period.
        const ageMs = Date.now() - submission.createdAt.getTime();
        if (ageMs >= MISS_GRACE_PERIOD_MS) {
          await prisma.printQueueSubmission.update({
            where: { id: submission.id },
            data: { capturedStatus: "missed", capturedAt: new Date() },
          });
          logger.warn(
            {
              submissionId: submission.id,
              bambuddyQueueItemId: submission.bambuddyQueueItemId,
            },
            "Queue item gone before stats captured",
          );
        }
        continue;
      }

      // Detect ID recycling: if we stored the original created_at, verify it
      // matches the item we just fetched.
      if (submission.bambuddyQueueCreatedAt && item.created_at) {
        const recordedMs = submission.bambuddyQueueCreatedAt.getTime();
        const fetchedMs = new Date(item.created_at).getTime();
        if (Math.abs(fetchedMs - recordedMs) > ID_RECYCLE_THRESHOLD_MS) {
          await prisma.printQueueSubmission.update({
            where: { id: submission.id },
            data: { capturedStatus: "missed", capturedAt: new Date() },
          });
          logger.warn(
            {
              submissionId: submission.id,
              bambuddyQueueItemId: submission.bambuddyQueueItemId,
              recorded: submission.bambuddyQueueCreatedAt,
              fetched: item.created_at,
            },
            "Queue item ID recycled — original stats lost",
          );
          continue;
        }
      }

      if (!TERMINAL_STATUSES.has(item.status)) continue;

      const capturedStartedAt = item.started_at
        ? new Date(item.started_at)
        : null;

      await prisma.printQueueSubmission.update({
        where: { id: submission.id },
        data: {
          capturedStatus: item.status,
          capturedAt: new Date(),
          capturedStartedAt,
          capturedCompletedAt: item.completed_at
            ? new Date(item.completed_at)
            : null,
          capturedFilamentGrams: item.filament_used_grams ?? null,
          capturedFilamentType: item.filament_type ?? null,
          capturedFilamentColor: item.filament_color ?? null,
          capturedPrinterId: item.printer_id ?? null,
          capturedPrinterName: item.printer_name ?? null,
        },
      });

      // Resolve the Bambuddy print log entry ID for reliable history matching.
      if (capturedStartedAt && item.printer_id) {
        try {
          const startMs = capturedStartedAt.getTime();
          const fromDate = new Date(startMs - 5 * 60_000)
            .toISOString()
            .slice(0, 10);
          const toDate = new Date(startMs + 5 * 60_000)
            .toISOString()
            .slice(0, 10);
          const logResult = await getPrintLog({
            printerId: item.printer_id,
            dateFrom: fromDate,
            dateTo: toDate,
            limit: 20,
          });
          const LOG_MATCH_MS = 5 * 60_000;
          const logEntry = logResult.items.find(
            (e) =>
              e.started_at !== null &&
              Math.abs(new Date(e.started_at).getTime() - startMs) <=
                LOG_MATCH_MS,
          );
          if (logEntry) {
            await prisma.printQueueSubmission.update({
              where: { id: submission.id },
              data: { capturedLogEntryId: logEntry.id },
            });
            logger.debug(
              { submissionId: submission.id, logEntryId: logEntry.id },
              "Linked submission to print log entry",
            );
          }
        } catch (logErr) {
          logger.warn(
            { logErr, submissionId: submission.id },
            "Could not resolve print log entry ID",
          );
        }
      }

      logger.info(
        {
          submissionId: submission.id,
          bambuddyQueueItemId: submission.bambuddyQueueItemId,
          status: item.status,
          filamentGrams: item.filament_used_grams,
        },
        "Captured queue stats",
      );
    } catch (err) {
      logger.error(
        { err, submissionId: submission.id },
        "Failed to poll queue item stats",
      );
    }
  }
}

export function initPrintQueuePoller(): void {
  const INTERVAL_MS = 30_000;
  pollPrintQueueStats().catch((err) =>
    logger.error({ err }, "Print queue poller failed on startup"),
  );
  setInterval(
    () =>
      pollPrintQueueStats().catch((err) =>
        logger.error({ err }, "Print queue poller failed"),
      ),
    INTERVAL_MS,
  );
  logger.info({ intervalMs: INTERVAL_MS }, "Print queue stats poller started");
}
