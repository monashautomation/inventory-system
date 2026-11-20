import { router, userProcedure, kioskProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger as rootLogger } from "@/server/lib/logger";
import { describeHmsErrors, type HmsErrorInfo } from "@/server/lib/hmsErrors";
import { evaluateTargeting, type GatePrinter } from "@/lib/queueGate";
import { prisma } from "@/server/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  listBambuddyPrinters,
  listBambuddyPrinterStatuses,
  getBambuddyPrinterStatus,
  listQueue,
  getQueueItem,
  addToQueue,
  cancelQueueItem,
  deleteQueueItem,
  startQueueItem,
  stopQueueItem,
  getArchiveFilamentRequirements,
  getAvailableFilamentsForModel,
  getAllAvailableFilaments,
  listBambuddyArchives,
  getBambuddyArchive,
  searchBambuddyArchives,
  duplicateArchiveWithRename,
  updateQueueItem,
  getInventoryAssignments,
  updateSpoolWeightUsed,
  updateInventorySpool,
  listInventorySpools,
  createInventorySpool,
  assignSpoolToSlot,
  BambuddyError,
  type FilamentOverride,
  type BambuddySpoolAssignment,
} from "@/server/lib/bambuddy";
import {
  buildAmsSlots,
  buildExternalSlots,
  matchFilaments,
  buildAmsMapping,
  type FilamentConstraint,
} from "@/server/api/utils/print/amsMatching";
import {
  buildPrintUploadFilename,
  parsePrintUploadFilename,
  printedByNameFromFilename,
  resolveUniqueFilename,
} from "@/server/api/utils/print/print.utils";

const logger = rootLogger.child({ module: "router:printQueue" });

/** Human-readable colour names must come from the spool explicitly assigned
 *  to a specific printer/AMS/tray - not a type+hex guess. Bambu firmware
 *  reports "FFFFFF" for trays it can't read (no RFID / manual load), which
 *  would otherwise coincidentally match an unrelated spool that's genuinely
 *  white and wrongly "resolve" an unlabelled tray. */
function assignmentKey(
  printerId: number,
  amsId: number,
  trayId: number,
): string {
  return `${printerId}:${amsId}:${trayId}`;
}

// A pending job never waits on a human - if it can't proceed it's because
// its assigned printer has a real problem. Surface that printer's AMS/HMS
// errors directly on the row instead of a "held" state, so it's clear the
// job is blocked by hardware, not policy. Bambuddy's raw status casing
// isn't guaranteed lowercase (the UI itself lowercases before comparing) -
// normalise here too.
async function computePendingPrinterHmsErrors(
  items: { status: string | null; printer_id: number | null }[],
): Promise<Map<number, HmsErrorInfo[]>> {
  const pendingPrinterIds = [
    ...new Set(
      items
        .filter(
          (i) => i.status?.toLowerCase() === "pending" && i.printer_id != null,
        )
        .map((i) => i.printer_id!),
    ),
  ];
  const printerStatuses = await Promise.allSettled(
    pendingPrinterIds.map((id) => getBambuddyPrinterStatus(id)),
  );
  const hmsErrorsByPrinterId = new Map<number, HmsErrorInfo[]>();
  pendingPrinterIds.forEach((id, i) => {
    const result = printerStatuses[i];
    if (result.status !== "fulfilled") return;
    const errors = describeHmsErrors(result.value.hms_errors);
    if (errors.length > 0) hmsErrorsByPrinterId.set(id, errors);
  });
  return hmsErrorsByPrinterId;
}

function buildAssignmentColorNameMap(
  assignments: BambuddySpoolAssignment[],
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const a of assignments) {
    if (!a.spool) continue;
    map.set(
      assignmentKey(a.printer_id, a.ams_id, a.tray_id),
      a.spool.color_name,
    );
  }
  return map;
}

const filamentConstraintSchema = z.object({
  slotIndex: z.number().int().min(0),
  slotId: z.number().int().positive().nullable().optional(),
  type: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  colorName: z.string().nullable().optional(),
});

function formatBambuddyStartError(detail: {
  code: string;
  deficit?: {
    slot_id: number;
    filament_type: string;
    required_grams: number;
    remaining_grams: number;
  }[];
}): string {
  if (detail.code === "insufficient_filament" && detail.deficit?.length) {
    const parts = detail.deficit.map(
      (d) =>
        `Slot ${d.slot_id} (${d.filament_type}): needs ${d.required_grams.toFixed(1)}g, ${d.remaining_grams.toFixed(1)}g remaining`,
    );
    return `Insufficient filament - ${parts.join("; ")}`;
  }
  return `Cannot start print: ${detail.code.replace(/_/g, " ")}`;
}

const targetingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("any") }),
  z.object({ mode: z.literal("model"), model: z.string().min(1) }),
  z.object({
    mode: z.literal("printer"),
    printerId: z.number().int().positive(),
  }),
]);

interface PrinterErrorState extends GatePrinter {
  /** Errors on the flag-only list: shown, but they do not block. */
  flaggedErrors: { code: string; description: string; reason: string | null }[];
}

/**
 * Each active printer with its current errors split into blocking and
 * flag-only. Blocking errors (everything not on the flag-only list, see
 * docs/hms-error-policy.md) stop a new print being queued to that printer.
 */
async function loadPrinterErrorStates(): Promise<PrinterErrorState[]> {
  const [printers, statuses] = await Promise.all([
    listBambuddyPrinters(),
    listBambuddyPrinterStatuses(),
  ]);
  const byId = new Map(printers.map((p) => [p.id, p]));
  return statuses.flatMap((s) => {
    const printer = byId.get(s.id);
    if (!printer?.is_active) return [];
    const infos = describeHmsErrors(s.hms_errors ?? []);
    return [
      {
        id: s.id,
        name: s.name,
        model: printer.model,
        blockingErrors: infos
          .filter((e) => e.blocking)
          .map((e) => `${e.code} ${e.description}`),
        flaggedErrors: infos
          .filter((e) => !e.blocking)
          .map((e) => ({
            code: e.code,
            description: e.description,
            reason: e.flagReason,
          })),
      },
    ];
  });
}

const addToQueueInputSchema = z.object({
  archiveId: z.number().int().positive(),
  targeting: targetingSchema,
  filamentConstraints: z.array(filamentConstraintSchema).default([]),
  options: z
    .object({
      bedLevelling: z.boolean().default(true),
      vibrationCali: z.boolean().default(true),
      timelapse: z.boolean().default(false),
      flowCali: z.boolean().default(false),
    })
    .default(() => ({
      bedLevelling: true,
      vibrationCali: true,
      timelapse: false,
      flowCali: false,
    })),
  notionProjectId: z.string().min(1).nullable().optional(),
  notionProjectName: z.string().min(1).nullable().optional(),
  personalUse: z.boolean().optional(),
});

export const printQueueRouter = router({
  listPrinters: userProcedure.query(async () => {
    try {
      const printers = await listBambuddyPrinters();
      return printers.filter((p) => p.is_active);
    } catch (err) {
      logger.error({ err }, "Failed to list Bambuddy printers");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch printers",
      });
    }
  }),

  listPrinterConnectivity: userProcedure.query(async () => {
    try {
      const [statuses, errorStates] = await Promise.all([
        listBambuddyPrinterStatuses(),
        loadPrinterErrorStates().catch((): PrinterErrorState[] => []),
      ]);
      const errorsById = new Map(errorStates.map((e) => [e.id, e]));
      return statuses.map((s) => ({
        id: s.id,
        name: s.name,
        connected: s.connected,
        awaitingPlateClear: s.awaiting_plate_clear ?? false,
        // Errors that stop a new print being queued to this printer.
        blockingErrors: errorsById.get(s.id)?.blockingErrors ?? [],
        // Errors that are shown but do not block.
        flaggedErrors: errorsById.get(s.id)?.flaggedErrors ?? [],
      }));
    } catch (err) {
      logger.error({ err }, "Failed to fetch printer connectivity");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch printer connectivity",
      });
    }
  }),

  getPrinterAms: userProcedure
    .input(z.object({ printerId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const [status, assignments] = await Promise.all([
          getBambuddyPrinterStatus(input.printerId),
          getInventoryAssignments(input.printerId).catch(() => []),
        ]);
        const colorNames = buildAssignmentColorNameMap(assignments);
        const rawSlots = [
          ...buildAmsSlots(status.ams),
          ...buildExternalSlots(status.vt_tray),
        ];
        const slots = rawSlots.map((slot) => ({
          ...slot,
          colorName:
            colorNames.get(
              assignmentKey(input.printerId, slot.amsId, slot.trayId),
            ) ?? null,
        }));
        return {
          amsExists: status.ams_exists,
          slots,
        };
      } catch (err) {
        logger.error(
          { err, printerId: input.printerId },
          "Failed to get printer AMS",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch printer AMS state",
        });
      }
    }),

  getAvailableFilamentsForModel: userProcedure
    .input(
      z.object({ model: z.string().min(1), location: z.string().optional() }),
    )
    .query(async ({ input }) => {
      try {
        const slots = await getAvailableFilamentsForModel(
          input.model,
          input.location,
        );
        const printerIds = [...new Set(slots.map((s) => s.printer_id))];
        const assignmentsByPrinter = await Promise.all(
          printerIds.map((id) => getInventoryAssignments(id).catch(() => [])),
        );
        const colorNames = buildAssignmentColorNameMap(
          assignmentsByPrinter.flat(),
        );
        return slots.map((s) => ({
          ...s,
          spool_color_name:
            colorNames.get(assignmentKey(s.printer_id, s.ams_id, s.tray_id)) ??
            null,
        }));
      } catch (err) {
        logger.error({ err }, "Failed to get available filaments");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch available filaments",
        });
      }
    }),

  getAvailableFilaments: userProcedure.query(async () => {
    try {
      return await getAllAvailableFilaments();
    } catch (err) {
      logger.error({ err }, "Failed to get all available filaments");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch available filaments",
      });
    }
  }),

  getFilamentRequirements: userProcedure
    .input(z.object({ archiveId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await getArchiveFilamentRequirements(input.archiveId);
      } catch (err) {
        logger.error(
          { err, archiveId: input.archiveId },
          "Failed to get filament requirements",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch filament requirements for this archive",
        });
      }
    }),

  listArchives: userProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await listBambuddyArchives({
          limit: input.limit,
          offset: input.offset,
        });
      } catch (err) {
        logger.error({ err }, "Failed to list archives");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch archives",
        });
      }
    }),

  listQueue: userProcedure
    .input(
      z.object({
        printerId: z.number().int().positive().optional(),
        status: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const items = await listQueue({
          printerId: input.printerId,
          status: input.status,
        });

        const itemIds = items.map((i) => i.id);
        const submissions = await prisma.printQueueSubmission.findMany({
          where: { bambuddyQueueItemId: { in: itemIds } },
          select: {
            bambuddyQueueItemId: true,
            notionProjectName: true,
            personalUse: true,
            user: { select: { name: true } },
          },
        });
        const subByItemId = new Map(
          submissions.map((s) => [s.bambuddyQueueItemId, s]),
        );

        const hmsErrorsByPrinterId =
          await computePendingPrinterHmsErrors(items);

        return items.map((item) => {
          const sub = subByItemId.get(item.id);
          const filenameName = printedByNameFromFilename(
            item.archive_name ?? item.library_file_name,
          );
          return {
            ...item,
            created_by_username:
              filenameName ??
              sub?.user.name ??
              item.created_by_username ??
              null,
            notionProjectName: sub?.notionProjectName ?? null,
            personalUse: sub?.personalUse ?? false,
            printerHmsErrors:
              item.status?.toLowerCase() === "pending" &&
              item.printer_id != null
                ? (hmsErrorsByPrinterId.get(item.printer_id) ?? null)
                : null,
          };
        });
      } catch (err) {
        logger.error({ err }, "Failed to list queue");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch print queue",
        });
      }
    }),

  // The signed-in user's own Bambu queue submissions, straight from our DB
  // (no BamBuddy round-trip) so it is cheap enough to poll from "My prints".
  listMine: userProcedure.query(({ ctx }) => {
    return prisma.printQueueSubmission.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        archiveName: true,
        notionProjectName: true,
        personalUse: true,
        createdAt: true,
        capturedStatus: true,
        capturedStartedAt: true,
        capturedCompletedAt: true,
        capturedFilamentGrams: true,
        capturedFilamentType: true,
        capturedPrinterName: true,
      },
    });
  }),

  addToQueue: userProcedure
    .input(addToQueueInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { targeting, filamentConstraints, options } = input;

      // Refuse to queue to a printer with a blocking error. If printer state
      // can't be read, fail open: BamBuddy still has the final say.
      try {
        const gate = evaluateTargeting(
          targeting,
          await loadPrinterErrorStates(),
        );
        if (!gate.allowed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: gate.reason ?? "That printer has an error to clear first.",
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.warn({ err }, "Could not check printer errors before queueing");
      }

      // Rename the archive to the person queuing this print. Reusing an
      // archive originally uploaded/named by someone else (or for a
      // different project) duplicates it under the new name instead of
      // mutating the shared library entry in place.
      let archiveId = input.archiveId;
      try {
        const archive = await getBambuddyArchive(input.archiveId);
        const parsed = parsePrintUploadFilename(archive.filename);
        const projectSegment = input.personalUse
          ? "Personal"
          : (input.notionProjectName ?? parsed?.project ?? "Personal");
        const fileSegment = parsed?.file ?? archive.filename;
        const desiredName = buildPrintUploadFilename(
          ctx.user.name,
          projectSegment,
          fileSegment,
        );

        if (desiredName !== archive.filename) {
          const uniqueName = await resolveUniqueFilename(
            desiredName,
            async (candidate) => {
              const matches = await searchBambuddyArchives(candidate);
              return matches.some((a) => a.filename === candidate);
            },
          );
          archiveId = await duplicateArchiveWithRename(
            input.archiveId,
            uniqueName,
          );
        }
      } catch (err) {
        logger.error(
          { err, archiveId: input.archiveId },
          "Failed to rename archive for queuing - using original archive",
        );
      }

      let amsMappingResult: number[] | null = null;
      let unmatched: number[] = [];

      let filamentOverrides: FilamentOverride[] | null = null;

      if (filamentConstraints.length > 0) {
        const colorConstraints = filamentConstraints.filter((c) => c.colorHex);

        // Specific-printer targeting: resolve AMS mapping against that printer's
        // live AMS state so the job starts on the right slot immediately. A
        // print must never be held on a manual release - if some slots can't
        // be matched right now, queue with a null mapping and let Bambuddy
        // resolve/dispatch normally; an unresolved match surfaces as a
        // printer error on the queue row instead of blocking the job.
        if (colorConstraints.length > 0 && targeting.mode === "printer") {
          try {
            const status = await getBambuddyPrinterStatus(targeting.printerId);
            const slots = [
              ...buildAmsSlots(status.ams),
              ...buildExternalSlots(status.vt_tray),
            ];
            const constraints: FilamentConstraint[] = colorConstraints;
            const matches = matchFilaments(constraints, slots);
            const result = buildAmsMapping(filamentConstraints.length, matches);
            amsMappingResult = result.mapping;
            unmatched = result.unmatched;

            if (unmatched.length > 0) {
              logger.warn(
                { unmatched, archiveId, printerId: targeting.printerId },
                "Some filament slots could not be matched - queuing anyway",
              );
            }
          } catch (err) {
            logger.error({ err }, "AMS matching failed - queuing anyway");
          }
        }

        // Model targeting: send force_color_match overrides so Bambuddy's
        // scheduler waits for a printer of the target model with exact colours
        // loaded. Bambuddy computes the AMS mapping at dispatch time.
        // "Any" targeting is intentionally excluded - Bambuddy drops
        // filament_overrides when no target_model is set.
        if (colorConstraints.length > 0 && targeting.mode === "model") {
          filamentOverrides = colorConstraints
            .filter((c) => c.type && c.colorHex && c.slotId != null)
            .map((c) => ({
              slot_id: c.slotId!,
              type: c.type!,
              color: `#${c.colorHex!.replace(/^#/, "").slice(0, 6).toUpperCase()}`,
              color_name:
                c.colorName ??
                `#${c.colorHex!.replace(/^#/, "").slice(0, 6).toUpperCase()}`,
              force_color_match: true,
            }));
          if (filamentOverrides.length === 0) filamentOverrides = null;
          logger.info(
            { colorConstraints: colorConstraints.length },
            "Queuing with force_color_match overrides - Bambuddy will wait for matching printer",
          );
        }
      }

      logger.info(
        {
          targetingMode: targeting.mode,
          totalConstraints: filamentConstraints.length,
          colorConstraintCount: filamentConstraints.filter((c) => c.colorHex)
            .length,
          filamentOverrides,
          amsMappingResult,
        },
        "addToQueue: constraint resolution",
      );

      const queuePayload = {
        archive_id: archiveId,
        printer_id: targeting.mode === "printer" ? targeting.printerId : null,
        target_model: targeting.mode === "model" ? targeting.model : null,
        filament_overrides: filamentOverrides,
        ams_mapping: amsMappingResult,
        bed_levelling: options.bedLevelling,
        vibration_cali: options.vibrationCali,
        timelapse: options.timelapse,
        flow_cali: options.flowCali,
        use_ams: true,
      };

      try {
        let result = await addToQueue(queuePayload);

        // If overrides were intended but bambuddy didn't persist them in the
        // POST response, patch the item immediately. This handles cases where
        // bambuddy silently drops overrides on creation (e.g. colour format
        // mismatch triggering a validation skip server-side).
        if (
          filamentOverrides !== null &&
          filamentOverrides.length > 0 &&
          (result.filament_overrides === null ||
            result.filament_overrides.length === 0)
        ) {
          logger.warn(
            { queueItemId: result.id, filamentOverrides },
            "filament_overrides missing from POST response - patching queue item",
          );
          try {
            result = await updateQueueItem(result.id, {
              filament_overrides: filamentOverrides,
            });
            logger.info(
              {
                queueItemId: result.id,
                storedFilamentOverrides: result.filament_overrides,
              },
              "filament_overrides applied via PATCH",
            );
          } catch (patchErr) {
            logger.error(
              { patchErr, queueItemId: result.id },
              "PATCH filament_overrides failed - job queued without colour enforcement",
            );
          }
        }

        try {
          await prisma.printQueueSubmission.create({
            data: {
              bambuddyQueueItemId: result.id,
              bambuddyQueueCreatedAt: result.created_at
                ? new Date(result.created_at)
                : null,
              archiveId: result.archive_id ?? null,
              archiveName: result.archive_name ?? null,
              userId: ctx.user.id,
              notionProjectId: input.notionProjectId,
              notionProjectName: input.notionProjectName,
              personalUse: input.personalUse ?? false,
            },
          });
        } catch (dbErr) {
          if (
            dbErr instanceof Prisma.PrismaClientKnownRequestError &&
            dbErr.code === "P2002"
          ) {
            logger.warn(
              { queueItemId: result.id },
              "PrintQueueSubmission already exists for this queue item (duplicate submit)",
            );
          } else {
            throw dbErr;
          }
        }
        logger.info(
          {
            queueItemId: result.id,
            archiveId,
            userId: ctx.user.id,
            storedFilamentOverrides: result.filament_overrides,
            storedAmsMapping: result.ams_mapping,
          },
          "Print queued",
        );
        return { queueItem: result, unmatchedSlots: unmatched };
      } catch (err) {
        logger.error({ err, queuePayload }, "Failed to add to queue");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not add job to print queue",
        });
      }
    }),

  cancelQueueItem: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        await cancelQueueItem(input.itemId);
      } catch (err) {
        logger.error(
          { err, itemId: input.itemId },
          "Failed to cancel queue item",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not cancel queue item",
        });
      }
    }),

  deleteQueueItem: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        await deleteQueueItem(input.itemId);
      } catch (err) {
        logger.error(
          { err, itemId: input.itemId },
          "Failed to delete queue item",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not remove queue item",
        });
      }
    }),

  startQueueItem: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await startQueueItem(input.itemId);
        logger.info(
          { itemId: input.itemId, userId: ctx.user.id },
          "Queue item started",
        );
      } catch (err) {
        logger.error(
          { err, itemId: input.itemId },
          "Failed to start queue item",
        );
        if (err instanceof BambuddyError && err.detail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: formatBambuddyStartError(err.detail),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not start queue item",
        });
      }
    }),

  stopQueueItem: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await stopQueueItem(input.itemId);
        logger.info(
          { itemId: input.itemId, userId: ctx.user.id },
          "Queue item stopped",
        );
      } catch (err) {
        logger.error(
          { err, itemId: input.itemId },
          "Failed to stop queue item",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not stop queue item",
        });
      }
    }),

  getFilamentShortInfo: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const item = await getQueueItem(input.itemId).catch(() => null);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Queue item not found",
        });
      }

      if (ctx.user.role !== "admin") {
        const submission = await prisma.printQueueSubmission.findFirst({
          where: { bambuddyQueueItemId: input.itemId, userId: ctx.user.id },
          select: { userId: true },
        });
        if (!submission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the person who submitted this print can override the filament check. Ask them to press 'Start anyway' from their account.",
          });
        }
      }

      if (!item.printer_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No printer is assigned to this job yet - cannot resolve filament shortage.",
        });
      }

      const requiredGrams = item.filament_used_grams ?? 0;
      const filamentType = item.filament_type?.toUpperCase() ?? null;

      // Normalise a hex color to 6 uppercase chars, no #
      function normalizeHex(hex: string | null | undefined): string | null {
        if (!hex) return null;
        return hex.replace(/^#/, "").slice(0, 6).toUpperCase();
      }

      // Prefer filament_overrides color, fall back to filament_color
      const targetColorHex = normalizeHex(
        item.filament_overrides?.[0]?.color ?? item.filament_color,
      );

      const printers = await listBambuddyPrinters();

      // Search every printer, not just the one assigned - the original
      // colour may have moved, or may not exist anywhere anymore, in
      // which case the user needs to see every colour that's actually
      // available (like the original filament picker used when queuing).
      const allSlots: {
        printerId: number;
        printerName: string;
        amsId: number;
        trayId: number;
        material: string;
        colorName: string | null;
        colorHex: string | null;
        remaining: number;
      }[] = [];

      for (const printer of printers) {
        const assignments = await getInventoryAssignments(printer.id).catch(
          () => [],
        );
        for (const a of assignments) {
          if (!a.spool) continue;
          allSlots.push({
            printerId: printer.id,
            printerName: printer.name,
            amsId: a.ams_id,
            trayId: a.tray_id,
            material: a.spool.material,
            colorName: a.spool.color_name ?? null,
            colorHex: normalizeHex(a.spool.rgba),
            remaining: a.spool.label_weight - a.spool.weight_used,
          });
        }
      }

      // Find a slot matching both type and color, anywhere
      const match = allSlots.find((s) => {
        const typeMatch =
          !filamentType || s.material.toUpperCase() === filamentType;
        const colorMatch = !targetColorHex || s.colorHex === targetColorHex;
        return typeMatch && colorMatch;
      });

      if (match) {
        return {
          status: "found" as const,
          printerId: match.printerId,
          printerName: match.printerName,
          filamentType: match.material,
          colorName: match.colorName,
          colorHex: match.colorHex,
          remaining: match.remaining,
          required: requiredGrams,
        };
      }

      // The original colour isn't available anywhere - let the user pick
      // any available colour of the same type, from any printer, using the
      // exact same picker as the "add to queue" filament step.
      const typeSlots = allSlots.filter(
        (s) => !filamentType || s.material.toUpperCase() === filamentType,
      );

      return {
        status: "choose_colour" as const,
        filamentType,
        filamentColor: targetColorHex,
        required: requiredGrams,
        candidates: typeSlots,
      };
    }),

  overrideFilamentShort: userProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        printerId: z.number().int().positive(),
        filamentType: z.string().min(1),
        colorHex: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { itemId, printerId, filamentType, colorHex } = input;

      if (ctx.user.role !== "admin") {
        const submission = await prisma.printQueueSubmission.findFirst({
          where: { bambuddyQueueItemId: itemId, userId: ctx.user.id },
          select: { userId: true },
        });
        if (!submission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the person who submitted this print can override the filament check. Ask them to press 'Start anyway' from their account.",
          });
        }
      }

      // Same policy as overrideFilamentToFull: filament remaining isn't
      // tracked for print blocking, so top up every matching spool (any
      // printer) rather than a single spool.
      const normalizedType = filamentType.toUpperCase();
      const normalizedHex = colorHex
        .replace(/^#/, "")
        .slice(0, 6)
        .toUpperCase();

      const spools = await listInventorySpools();
      const matches = spools.filter((s) => {
        if (s.archived_at) return false;
        if (s.material.toUpperCase() !== normalizedType) return false;
        const hex = (s.rgba ?? "").replace(/^#/, "").slice(0, 6).toUpperCase();
        return hex === normalizedHex;
      });
      await Promise.all(matches.map((s) => updateSpoolWeightUsed(s.id, 0)));

      // Reassign queue item to the printer that actually has this colour
      const item = await getQueueItem(itemId).catch(() => null);
      if (item && item.printer_id !== printerId) {
        await updateQueueItem(itemId, { printer_id: printerId });
      }

      logger.info(
        {
          itemId,
          printerId,
          filamentType: normalizedType,
          colorHex: normalizedHex,
          spoolCount: matches.length,
          userId: ctx.user.id,
        },
        "Filament short override applied",
      );
    }),

  // Auto-resolves a filament_short warning with no user interaction:
  // tops up the matching spool to 100% if the colour is loaded on the
  // assigned printer, reassigns the job to a different printer if the
  // colour is loaded there instead, or reports "unavailable" so the UI
  // can prompt the user to pick a different colour.
  autoResolveFilamentShort: userProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const item = await getQueueItem(input.itemId).catch(() => null);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Queue item not found",
        });
      }

      if (ctx.user.role !== "admin") {
        const submission = await prisma.printQueueSubmission.findFirst({
          where: { bambuddyQueueItemId: input.itemId, userId: ctx.user.id },
          select: { userId: true },
        });
        if (!submission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only the person who submitted this print can resolve the filament check.",
          });
        }
      }

      if (!item.printer_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No printer is assigned to this job yet - cannot resolve filament shortage.",
        });
      }

      function normalizeHex(hex: string | null | undefined): string | null {
        if (!hex) return null;
        return hex.replace(/^#/, "").slice(0, 6).toUpperCase();
      }

      const filamentType = item.filament_type?.toUpperCase() ?? null;
      const targetColorHex = normalizeHex(
        item.filament_overrides?.[0]?.color ?? item.filament_color,
      );

      if (!filamentType) {
        return { status: "unavailable" as const };
      }

      const printers = await listBambuddyPrinters();
      const candidates: {
        printerId: number;
        printerName: string;
        spoolId: number;
      }[] = [];

      for (const printer of printers) {
        const assignments = await getInventoryAssignments(printer.id).catch(
          () => [],
        );
        for (const a of assignments) {
          if (!a.spool) continue;
          const typeMatch = a.spool.material.toUpperCase() === filamentType;
          const colorMatch =
            !targetColorHex || normalizeHex(a.spool.rgba) === targetColorHex;
          if (typeMatch && colorMatch) {
            candidates.push({
              printerId: printer.id,
              printerName: printer.name,
              spoolId: a.spool.id,
            });
          }
        }
      }

      const onAssignedPrinter = candidates.find(
        (c) => c.printerId === item.printer_id,
      );

      if (onAssignedPrinter) {
        await updateSpoolWeightUsed(onAssignedPrinter.spoolId, 0);
        logger.info(
          { itemId: input.itemId, spoolId: onAssignedPrinter.spoolId },
          "Filament short auto-resolved on assigned printer",
        );
        return { status: "resolved_here" as const };
      }

      const elsewhere = candidates[0];
      if (elsewhere) {
        await updateSpoolWeightUsed(elsewhere.spoolId, 0);
        await updateQueueItem(input.itemId, {
          printer_id: elsewhere.printerId,
        });
        logger.info(
          {
            itemId: input.itemId,
            newPrinterId: elsewhere.printerId,
            spoolId: elsewhere.spoolId,
          },
          "Filament short auto-resolved by reassigning to a printer with matching colour",
        );
        return {
          status: "resolved_elsewhere" as const,
          printerName: elsewhere.printerName,
        };
      }

      return { status: "unavailable" as const };
    }),

  // Filament remaining tracking has been disabled by policy: prints must
  // never be blocked by spool level. Whenever a user picks a filament
  // colour in the queue modal, every spool of that type+colour (on every
  // printer) is reset to 100% remaining so the start-time deficit check
  // in bambuddy never fires.
  overrideFilamentToFull: userProcedure
    .input(
      z.object({
        filamentType: z.string().min(1),
        colorHex: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const normalizedType = input.filamentType.toUpperCase();
      const normalizedHex = input.colorHex
        .replace(/^#/, "")
        .slice(0, 6)
        .toUpperCase();

      const spools = await listInventorySpools();
      const matches = spools.filter((s) => {
        if (s.archived_at) return false;
        if (s.material.toUpperCase() !== normalizedType) return false;
        const hex = (s.rgba ?? "").replace(/^#/, "").slice(0, 6).toUpperCase();
        return hex === normalizedHex;
      });

      await Promise.all(matches.map((s) => updateSpoolWeightUsed(s.id, 0)));

      logger.info(
        {
          filamentType: normalizedType,
          colorHex: normalizedHex,
          spoolCount: matches.length,
        },
        "Filament remaining overridden to 100% across matching spools",
      );

      return { updatedSpoolCount: matches.length };
    }),

  // Lets a user attach/change a human-readable colour name (and optionally
  // correct the hex) for a filament tray. Updates the matching inventory
  // spool if one exists for that type+colour; otherwise creates one and
  // assigns it to the specific AMS tray the user was configuring, since an
  // "Unknown" tray has no spool record to update.
  nameFilamentColor: userProcedure
    .input(
      z.object({
        printerId: z.number().int().positive(),
        amsId: z.number().int(),
        trayId: z.number().int(),
        filamentType: z.string().min(1),
        colorHex: z.string().min(1),
        colorName: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const normalizedType = input.filamentType.toUpperCase();
      // Bambuddy's inventory API requires RRGGBBAA (8 hex chars).
      const rawHex = input.colorHex.replace(/^#/, "").toUpperCase();
      const normalizedNewHex =
        rawHex.length >= 8 ? rawHex.slice(0, 8) : `${rawHex.slice(0, 6)}FF`;

      // Look up by the tray's actual assignment, not a type+hex guess - the
      // hex alone can't be trusted (see buildAssignmentColorNameMap).
      const assignments = await getInventoryAssignments(input.printerId);
      const existing = assignments.find(
        (a) => a.ams_id === input.amsId && a.tray_id === input.trayId,
      )?.spool;

      if (existing) {
        await updateInventorySpool(existing.id, {
          color_name: input.colorName,
          rgba: normalizedNewHex,
          weight_used: 0,
        });
      } else {
        const created = await createInventorySpool({
          material: normalizedType,
          color_name: input.colorName,
          rgba: normalizedNewHex,
          weight_used: 0,
        });
        await assignSpoolToSlot({
          spoolId: created.id,
          printerId: input.printerId,
          amsId: input.amsId,
          trayId: input.trayId,
        });
      }

      logger.info(
        {
          printerId: input.printerId,
          amsId: input.amsId,
          trayId: input.trayId,
          filamentType: normalizedType,
          colorHex: normalizedNewHex,
          colorName: input.colorName,
          matchedExistingSpool: Boolean(existing),
        },
        "Filament colour named",
      );

      return { ok: true };
    }),

  // Returns the full queue (not just active jobs) so the kiosk can mirror
  // the print queue page's design: pending/printing up top, printer
  // AMS/HMS errors surfaced on stuck pending jobs, and finished jobs
  // available for a collapsed history section rather than dropped entirely.
  getKioskQueue: kioskProcedure.query(async () => {
    try {
      const items = await listQueue();
      const itemIds = items.map((i) => i.id);
      const submissions = await prisma.printQueueSubmission.findMany({
        where: { bambuddyQueueItemId: { in: itemIds } },
        select: {
          bambuddyQueueItemId: true,
          notionProjectName: true,
          personalUse: true,
          user: { select: { name: true } },
        },
      });
      const subByItemId = new Map(
        submissions.map((s) => [s.bambuddyQueueItemId, s]),
      );

      const hmsErrorsByPrinterId = await computePendingPrinterHmsErrors(items);

      return items.map((item) => {
        const sub = subByItemId.get(item.id);
        const filenameName = printedByNameFromFilename(
          item.archive_name ?? item.library_file_name,
        );
        return {
          id: item.id,
          position: item.position,
          status: item.status,
          file_name: item.library_file_name ?? item.archive_name ?? null,
          submitted_by:
            filenameName ?? sub?.user.name ?? item.created_by_username ?? null,
          project: sub?.personalUse
            ? "Personal"
            : (sub?.notionProjectName ?? null),
          created_at: item.created_at,
          completed_at: item.completed_at,
          printer_id: item.printer_id,
          printer_name: item.printer_name,
          printerHmsErrors:
            item.status?.toLowerCase() === "pending" && item.printer_id != null
              ? (hmsErrorsByPrinterId.get(item.printer_id) ?? null)
              : null,
        };
      });
    } catch (err) {
      logger.error({ err }, "Failed to list kiosk queue");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch print queue",
      });
    }
  }),
});
