import { router, userProcedure } from "@/server/trpc";
import { resolveAvatarUrl } from "@/server/lib/avatar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger as rootLogger } from "@/server/lib/logger";
import {
  getArchiveStats,
  getAllUsageHistory,
  getFilamentCatalog,
  listBambuddyPrinters,
  getPrintLog,
} from "@/server/lib/bambuddy";
import { prisma } from "@/server/lib/prisma";
import { Prisma } from "@prisma/client";

const logger = rootLogger.child({ module: "router:printStats" });

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function toDateStr(dt: string): string {
  return dt.slice(0, 10);
}

export const printStatsRouter = router({
  overview: userProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getArchiveStats({
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        });
      } catch (err) {
        logger.error({ err }, "Failed to get archive stats");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch print statistics",
        });
      }
    }),

  printLog: userProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(20),
        printerId: z.number().int().positive().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const where: Prisma.PrintQueueSubmissionWhereInput = {};

        if (input.search) {
          where.archiveName = { contains: input.search, mode: "insensitive" };
        }
        if (input.printerId != null) {
          where.capturedPrinterId = input.printerId;
        }
        if (input.status && input.status !== "all") {
          // "pending" maps to no captured status yet
          where.capturedStatus =
            input.status === "pending" ? null : input.status;
        }
        if (input.dateFrom || input.dateTo) {
          const dateFilter: Prisma.DateTimeNullableFilter = {};
          if (input.dateFrom) dateFilter.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const d = new Date(input.dateTo);
            d.setHours(23, 59, 59, 999);
            dateFilter.lte = d;
          }
          // Filter on start time when known, else fall back to submission date
          where.OR = [
            { capturedStartedAt: dateFilter },
            {
              capturedStartedAt: null,
              createdAt: dateFilter as Prisma.DateTimeFilter,
            },
          ];
        }

        const [total, submissions] = await Promise.all([
          prisma.printQueueSubmission.count({ where }),
          prisma.printQueueSubmission.findMany({
            where,
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: input.page * input.pageSize,
            take: input.pageSize,
          }),
        ]);

        return {
          total,
          items: submissions.map((sub) => {
            const durationSeconds =
              sub.capturedStartedAt && sub.capturedCompletedAt
                ? Math.round(
                    (sub.capturedCompletedAt.getTime() -
                      sub.capturedStartedAt.getTime()) /
                      1000,
                  )
                : null;

            return {
              id: sub.id,
              logEntryId: sub.capturedLogEntryId,
              archiveId: sub.archiveId,
              printName: sub.archiveName,
              printerName: sub.capturedPrinterName,
              printerId: sub.capturedPrinterId,
              status: sub.capturedStatus ?? "pending",
              startedAt: sub.capturedStartedAt?.toISOString() ?? null,
              completedAt: sub.capturedCompletedAt?.toISOString() ?? null,
              durationSeconds,
              filamentType: sub.capturedFilamentType,
              filamentColor: sub.capturedFilamentColor,
              filamentUsedGrams: sub.capturedFilamentGrams,
              createdByUsername: sub.user.name,
              createdByUserId: sub.user.id,
              createdByUserImage: resolveAvatarUrl(sub.user.id, sub.user.image),
              notionProjectName: sub.notionProjectName,
              personalUse: sub.personalUse,
              createdAt: sub.createdAt.toISOString(),
            };
          }),
        };
      } catch (err) {
        logger.error({ err }, "Failed to get print log");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch print history",
        });
      }
    }),

  filamentTimeSeries: userProcedure
    .input(
      z.object({
        days: z.union([
          z.literal(7),
          z.literal(30),
          z.literal(90),
          z.literal(365),
        ]),
        filamentTypes: z.array(z.string()).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const dateFrom = daysAgoIso(input.days);
        const result = await getPrintLog({
          dateFrom,
          limit: 500,
          offset: 0,
        });

        const entries = result.items.filter(
          (e) =>
            e.filament_used_grams != null &&
            e.filament_used_grams > 0 &&
            (input.filamentTypes == null ||
              input.filamentTypes.length === 0 ||
              (e.filament_type != null &&
                input.filamentTypes.includes(e.filament_type))),
        );

        // Collect all filament types present
        const types = [
          ...new Set(entries.map((e) => e.filament_type ?? "Unknown")),
        ].sort();

        // Build a date → { [type]: grams } map
        const byDate = new Map<string, Record<string, number>>();
        for (const entry of entries) {
          const date = toDateStr(entry.created_at);
          const type = entry.filament_type ?? "Unknown";
          if (!byDate.has(date)) byDate.set(date, {});
          const day = byDate.get(date)!;
          day[type] = (day[type] ?? 0) + (entry.filament_used_grams ?? 0);
        }

        // Fill all days in range (ascending)
        type TimeRow = { date: string } & Record<string, number | string>;
        const rows: TimeRow[] = [];
        const start = new Date(dateFrom);
        const today = new Date();
        for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          const day = byDate.get(key) ?? {};
          const row: TimeRow = { date: key };
          for (const t of types) row[t] = day[t] ?? 0;
          rows.push(row);
        }

        return { rows, types };
      } catch (err) {
        logger.error({ err }, "Failed to build filament time series");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not build filament usage chart",
        });
      }
    }),

  filamentLeaderboard: userProcedure
    .input(
      z.object({
        days: z.union([
          z.literal(7),
          z.literal(30),
          z.literal(90),
          z.literal(365),
          z.literal(0), // 0 = all time
        ]),
      }),
    )
    .query(async ({ input }) => {
      try {
        const dateFrom = input.days > 0 ? daysAgoIso(input.days) : undefined;

        const PAGE = 500;
        const first = await getPrintLog({ dateFrom, limit: PAGE, offset: 0 });
        const allItems = [...first.items];
        const pages = Math.ceil(first.total / PAGE);
        for (let p = 1; p < pages; p++) {
          const page = await getPrintLog({
            dateFrom,
            limit: PAGE,
            offset: p * PAGE,
          });
          allItems.push(...page.items);
        }

        interface LeaderEntry {
          type: string;
          color: string | null;
          printCount: number;
          totalGrams: number;
        }
        const byKey = new Map<string, LeaderEntry>();

        for (const entry of allItems) {
          if (!entry.filament_type) continue;
          const key = `${entry.filament_type}||${entry.filament_color ?? ""}`;
          const existing = byKey.get(key);
          if (existing) {
            existing.printCount += 1;
            existing.totalGrams += entry.filament_used_grams ?? 0;
          } else {
            byKey.set(key, {
              type: entry.filament_type,
              color: entry.filament_color ?? null,
              printCount: 1,
              totalGrams: entry.filament_used_grams ?? 0,
            });
          }
        }

        return [...byKey.values()].sort((a, b) => b.printCount - a.printCount);
      } catch (err) {
        logger.error({ err }, "Failed to build filament leaderboard");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch filament leaderboard",
        });
      }
    }),

  usageHistory: userProcedure
    .input(
      z.object({
        printerId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getAllUsageHistory({ printerId: input.printerId });
      } catch (err) {
        logger.error({ err }, "Failed to get usage history");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch spool usage history",
        });
      }
    }),

  filamentCatalog: userProcedure.query(async () => {
    try {
      return await getFilamentCatalog();
    } catch (err) {
      logger.error({ err }, "Failed to get filament catalog");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch filament catalog",
      });
    }
  }),

  printers: userProcedure.query(async () => {
    try {
      const printers = await listBambuddyPrinters();
      return printers.filter((p) => p.is_active);
    } catch (err) {
      logger.error({ err }, "Failed to list printers for stats");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch printers",
      });
    }
  }),

  filamentByProject: userProcedure
    .input(
      z.object({
        days: z.union([
          z.literal(7),
          z.literal(30),
          z.literal(90),
          z.literal(365),
          z.literal(0),
        ]),
      }),
    )
    .query(async ({ input }) => {
      try {
        const dateFrom =
          input.days > 0
            ? new Date(Date.now() - input.days * 86400_000)
            : undefined;

        const submissions = await prisma.printQueueSubmission.findMany({
          where: {
            capturedStatus: { in: ["completed", "failed"] },
            capturedFilamentGrams: { gt: 0 },
            ...(dateFrom ? { capturedStartedAt: { gte: dateFrom } } : {}),
          },
          select: {
            notionProjectName: true,
            personalUse: true,
            capturedFilamentGrams: true,
          },
        });

        const byProject = new Map<
          string,
          { projectName: string; printCount: number; totalGrams: number }
        >();
        for (const sub of submissions) {
          const projectName = sub.notionProjectName ?? null;
          const key =
            projectName ?? (sub.personalUse ? "__personal__" : "__unknown__");
          const label =
            projectName ?? (sub.personalUse ? "Personal use" : "Unknown");
          const grams = sub.capturedFilamentGrams ?? 0;
          const existing = byProject.get(key);
          if (existing) {
            existing.printCount++;
            existing.totalGrams += grams;
          } else {
            byProject.set(key, {
              projectName: label,
              printCount: 1,
              totalGrams: grams,
            });
          }
        }

        return [...byProject.values()]
          .filter((e) => e.totalGrams > 0)
          .sort((a, b) => b.totalGrams - a.totalGrams);
      } catch (err) {
        logger.error({ err }, "Failed to build filament by project");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch filament by project",
        });
      }
    }),

  filamentByPerson: userProcedure
    .input(
      z.object({
        days: z.union([
          z.literal(7),
          z.literal(30),
          z.literal(90),
          z.literal(365),
          z.literal(0),
        ]),
      }),
    )
    .query(async ({ input }) => {
      try {
        const dateFrom =
          input.days > 0
            ? new Date(Date.now() - input.days * 86400_000)
            : undefined;

        const submissions = await prisma.printQueueSubmission.findMany({
          where: {
            capturedStatus: { in: ["completed", "failed"] },
            capturedFilamentGrams: { gt: 0 },
            ...(dateFrom ? { capturedStartedAt: { gte: dateFrom } } : {}),
          },
          select: {
            capturedFilamentGrams: true,
            user: { select: { name: true } },
          },
        });

        const byPerson = new Map<
          string,
          { username: string; printCount: number; totalGrams: number }
        >();
        for (const sub of submissions) {
          const username = sub.user.name ?? "Unknown";
          const grams = sub.capturedFilamentGrams ?? 0;
          const existing = byPerson.get(username);
          if (existing) {
            existing.printCount++;
            existing.totalGrams += grams;
          } else {
            byPerson.set(username, {
              username,
              printCount: 1,
              totalGrams: grams,
            });
          }
        }

        return [...byPerson.values()]
          .filter((e) => e.totalGrams > 0)
          .sort((a, b) => b.totalGrams - a.totalGrams);
      } catch (err) {
        logger.error({ err }, "Failed to build filament by person");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not fetch filament by person",
        });
      }
    }),

  exportAvailable: userProcedure.query(() => {
    return !!(process.env.BAMBUDDY_ENDPOINT && process.env.BAMBUDDY_API_KEY);
  }),
});
