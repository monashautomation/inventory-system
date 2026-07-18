import { router, userProcedure, kioskProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger as rootLogger } from "@/server/lib/logger";
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
  BambuddyError,
  type FilamentOverride,
} from "@/server/lib/bambuddy";
import {
  buildAmsSlots,
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
    return `Insufficient filament — ${parts.join("; ")}`;
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

const addToQueueInputSchema = z.object({
  archiveId: z.number().int().positive(),
  targeting: targetingSchema,
  filamentConstraints: z.array(filamentConstraintSchema).default([]),
  options: z
    .object({
      manualStart: z.boolean().default(false),
      bedLevelling: z.boolean().default(true),
      vibrationCali: z.boolean().default(true),
      timelapse: z.boolean().default(false),
      flowCali: z.boolean().default(false),
    })
    .default(() => ({
      manualStart: false,
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
      const statuses = await listBambuddyPrinterStatuses();
      return statuses.map((s) => ({
        id: s.id,
        name: s.name,
        connected: s.connected,
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
        const status = await getBambuddyPrinterStatus(input.printerId);
        return {
          amsExists: status.ams_exists,
          slots: buildAmsSlots(status.ams),
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
        return await getAvailableFilamentsForModel(input.model, input.location);
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

  addToQueue: userProcedure
    .input(addToQueueInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { targeting, filamentConstraints, options } = input;

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
          "Failed to rename archive for queuing — using original archive",
        );
      }

      let amsMappingResult: number[] | null = null;
      let unmatched: number[] = [];
      let manualStart = options.manualStart;

      let filamentOverrides: FilamentOverride[] | null = null;

      if (filamentConstraints.length > 0) {
        const colorConstraints = filamentConstraints.filter((c) => c.colorHex);

        // Specific-printer targeting: resolve AMS mapping against that printer's
        // live AMS state so the job starts on the right slot immediately.
        if (colorConstraints.length > 0 && targeting.mode === "printer") {
          try {
            const status = await getBambuddyPrinterStatus(targeting.printerId);
            const slots = buildAmsSlots(status.ams);
            const constraints: FilamentConstraint[] = colorConstraints;
            const matches = matchFilaments(constraints, slots);
            const result = buildAmsMapping(filamentConstraints.length, matches);
            amsMappingResult = result.mapping;
            unmatched = result.unmatched;

            if (unmatched.length > 0) {
              logger.warn(
                { unmatched, archiveId, printerId: targeting.printerId },
                "Some filament slots could not be matched — setting manual_start",
              );
              manualStart = true;
            }
          } catch (err) {
            logger.error(
              { err },
              "AMS matching failed — falling back to manual start",
            );
            manualStart = true;
          }
        }

        // Model targeting: send force_color_match overrides so Bambuddy's
        // scheduler waits for a printer of the target model with exact colours
        // loaded. Bambuddy computes the AMS mapping at dispatch time.
        // "Any" targeting is intentionally excluded — Bambuddy drops
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
            "Queuing with force_color_match overrides — Bambuddy will wait for matching printer",
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
        manual_start: manualStart,
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
            "filament_overrides missing from POST response — patching queue item",
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
              "PATCH filament_overrides failed — job queued without colour enforcement",
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
            "No printer is assigned to this job yet — cannot resolve filament shortage.",
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
      const printer = printers.find((p) => p.id === item.printer_id);
      const printerName = printer?.name ?? `Printer #${item.printer_id}`;

      const assignments = await getInventoryAssignments(item.printer_id);

      const slots = assignments
        .filter((a) => a.spool != null)
        .map((a) => ({
          spoolId: a.spool!.id,
          amsId: a.ams_id,
          trayId: a.tray_id,
          material: a.spool!.material,
          colorName: a.spool!.color_name ?? null,
          colorHex: normalizeHex(a.spool!.rgba),
          remaining: a.spool!.label_weight - a.spool!.weight_used,
        }));

      // Find a slot matching both type and color
      const match = slots.find((s) => {
        const typeMatch =
          !filamentType || s.material.toUpperCase() === filamentType;
        const colorMatch = !targetColorHex || s.colorHex === targetColorHex;
        return typeMatch && colorMatch;
      });

      if (match) {
        return {
          status: "found" as const,
          printerId: item.printer_id,
          printerName,
          spoolId: match.spoolId,
          filamentType: match.material,
          colorName: match.colorName,
          colorHex: match.colorHex,
          remaining: match.remaining,
          required: requiredGrams,
        };
      }

      // No match — return all slots for manual selection
      return {
        status: "no_match" as const,
        printerId: item.printer_id,
        printerName,
        filamentType,
        filamentColor: targetColorHex,
        required: requiredGrams,
        slots,
      };
    }),

  overrideFilamentShort: userProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        printerId: z.number().int().positive(),
        spoolId: z.number().int().positive(),
        requiredGrams: z.number().min(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { itemId, printerId, spoolId, requiredGrams } = input;

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

      // Fetch current spool to compute new weight_used
      const assignments = await getInventoryAssignments(printerId).catch(
        () => [],
      );
      const assignment = assignments.find((a) => a.spool?.id === spoolId);
      const spool = assignment?.spool;
      if (!spool) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Spool not found on that printer",
        });
      }

      // Set weight_used so remaining = requiredGrams (just enough to pass the check)
      const newWeightUsed = Math.max(0, spool.label_weight - requiredGrams);
      await updateSpoolWeightUsed(spoolId, newWeightUsed);

      // Reassign queue item to this printer if it differs
      const item = await getQueueItem(itemId).catch(() => null);
      if (item && item.printer_id !== printerId) {
        await updateQueueItem(itemId, { printer_id: printerId });
      }

      logger.info(
        { itemId, printerId, spoolId, newWeightUsed, userId: ctx.user.id },
        "Filament short override applied",
      );
    }),

  getKioskQueue: kioskProcedure.query(async () => {
    try {
      const items = await listQueue();
      const activeItems = items.filter(
        (i) => i.status === "pending" || i.status === "printing",
      );
      const itemIds = activeItems.map((i) => i.id);
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
      return activeItems.map((item) => {
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
