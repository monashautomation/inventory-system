import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger as rootLogger } from "@/server/lib/logger";
import { prisma } from "@/server/lib/prisma";
import {
  listBambuddyPrinters,
  getBambuddyPrinterStatus,
  listQueue,
  addToQueue,
  cancelQueueItem,
  deleteQueueItem,
  startQueueItem,
  stopQueueItem,
  getArchiveFilamentRequirements,
  getAvailableFilamentsForModel,
  getAllAvailableFilaments,
  listBambuddyArchives,
} from "@/server/lib/bambuddy";
import {
  buildAmsSlots,
  matchFilaments,
  buildAmsMapping,
  type FilamentConstraint,
} from "@/server/api/utils/print/amsMatching";

const logger = rootLogger.child({ module: "router:printQueue" });

const filamentConstraintSchema = z.object({
  slotIndex: z.number().int().min(0),
  slotId: z.number().int().positive().nullable().optional(),
  type: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  colorName: z.string().nullable().optional(),
});

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
        return await listQueue({
          printerId: input.printerId,
          status: input.status,
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
      const { archiveId, targeting, filamentConstraints, options } = input;

      let amsMappingResult: number[] | null = null;
      let unmatched: number[] = [];
      let requiredFilamentTypes: string[] | null = null;
      let manualStart = options.manualStart;

      let filamentOverrides:
        | { slot_id: number; type: string; color: string }[]
        | null = null;

      if (filamentConstraints.length > 0) {
        const typeConstraints = filamentConstraints.filter(
          (c) => c.type && !c.colorHex,
        );
        const colorConstraints = filamentConstraints.filter((c) => c.colorHex);

        if (typeConstraints.length > 0) {
          requiredFilamentTypes = Array.from(
            {
              length: Math.max(...typeConstraints.map((c) => c.slotIndex)) + 1,
            },
            (_, i) => {
              const constraint = typeConstraints.find((c) => c.slotIndex === i);
              return constraint?.type ?? "";
            },
          ).filter(Boolean);
        }

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

        // For model/any targeting, pass color preferences as filament_overrides so
        // Bambuddy's dispatch engine can honour them when it assigns a printer.
        if (colorConstraints.length > 0 && targeting.mode !== "printer") {
          filamentOverrides = colorConstraints
            .filter((c) => c.slotId != null && c.type && c.colorHex)
            .map((c) => ({
              slot_id: c.slotId!,
              type: c.type!,
              color: `#${c.colorHex!.replace(/^#/, "").slice(0, 6).toUpperCase()}`,
              ...(c.colorName ? { color_name: c.colorName } : {}),
              force_color_match: true,
            }));
          if (filamentOverrides.length === 0) filamentOverrides = null;
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
        required_filament_types: requiredFilamentTypes,
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
        const result = await addToQueue(queuePayload);
        await prisma.printQueueSubmission.create({
          data: { bambuddyQueueItemId: result.id, userId: ctx.user.id },
        });
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

  cancelQueueItem: adminProcedure
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

  deleteQueueItem: adminProcedure
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

  startQueueItem: adminProcedure
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not start queue item",
        });
      }
    }),

  stopQueueItem: adminProcedure
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
});
