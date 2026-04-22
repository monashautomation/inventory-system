// server/trpc/routers/dashboard.ts
import { z } from "zod";
import { userProcedure, router } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";

type ConsumptionRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1yr";

const getRangeStart = (range: ConsumptionRange): Date => {
  const d = new Date();
  switch (range) {
    case "1d":
      d.setDate(d.getDate() - 1);
      break;
    case "1w":
      d.setDate(d.getDate() - 7);
      break;
    case "1m":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3m":
      d.setMonth(d.getMonth() - 3);
      break;
    case "6m":
      d.setMonth(d.getMonth() - 6);
      break;
    case "1yr":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  return d;
};

export const dashboardRouter = router({
  getLoanHistory: userProcedure
    .meta({
      mcp: {
        name: "dashboard_getLoanHistory",
        enabled: true,
        description:
          "Get loan transaction history aggregated by date. Accepts a range parameter: 'week', 'month', or 'year'",
      },
    })
    .input(
      z.object({
        range: z.enum(["week", "month", "year"]),
      }),
    )
    .query(async ({ input }) => {
      const startDate = new Date();
      switch (input.range) {
        case "week":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "year":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      const records = await prisma.itemRecord.groupBy({
        by: ["createdAt"],
        _count: { id: true },
        where: {
          createdAt: {
            gte: startDate,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return records.map((r) => ({
        date: r.createdAt.toISOString().split("T")[0],
        count: r._count.id,
      }));
    }),

  getInventoryByLocation: userProcedure
    .meta({
      mcp: {
        name: "dashboard_getInventoryByLocation",
        enabled: true,
        description: "Get the count of non-deleted items at each location",
      },
    })
    .query(async () => {
      const locations = await prisma.location.findMany({
        include: {
          items: {
            where: { deleted: false },
          },
        },
      });

      return locations.map((location) => ({
        locationName: location.name,
        itemCount: location.items.length,
      }));
    }),

  getTopLoanedItems: userProcedure
    .meta({
      mcp: {
        name: "dashboard_getTopLoanedItems",
        enabled: true,
        description:
          "Get the most frequently loaned items, ranked by loan count. Accepts a limit parameter (1-20, default 5)",
      },
    })
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ input }) => {
      const items = await prisma.item.findMany({
        take: input.limit,
        where: {
          consumable: {
            is: null,
          },
          ItemRecords: {
            some: {
              loaned: true,
            },
          },
        },
        include: {
          ItemRecords: {
            where: { loaned: true },
          },
        },
        orderBy: {
          ItemRecords: {
            _count: "desc",
          },
        },
      });

      return items.map((item) => ({
        itemName: item.name,
        loanCount: item.ItemRecords.length,
      }));
    }),

  getItemStatusStats: userProcedure
    .meta({
      mcp: {
        name: "dashboard_getItemStatusStats",
        enabled: true,
        description:
          "Get overall inventory statistics: total items, currently loaned count, and total available consumable quantity",
      },
    })
    .query(async () => {
      const [total, loaned, available] = await Promise.all([
        prisma.item.count({ where: { deleted: false } }),
        prisma.itemRecord.count({ where: { loaned: true } }),
        prisma.consumable.aggregate({
          _sum: { available: true },
        }),
      ]);

      return {
        total,
        loaned,
        available: available._sum.available ?? 0,
      };
    }),

  getConsumptionStats: userProcedure
    .input(z.object({ range: z.enum(["1d", "1w", "1m", "3m", "6m", "1yr"]) }))
    .query(async ({ input }) => {
      const startDate = getRangeStart(input.range);
      const records = await prisma.itemRecord.findMany({
        where: {
          loaned: false,
          createdAt: { gte: startDate },
          item: { consumable: { isNot: null } },
        },
        include: { item: { select: { cost: true } } },
      });
      const totalConsumed = records.reduce((sum, r) => sum + r.quantity, 0);
      const totalCost = records.reduce(
        (sum, r) => sum + r.quantity * r.item.cost,
        0,
      );
      return { totalConsumed, totalCost };
    }),

  getTopConsumedConsumables: userProcedure
    .input(
      z.object({
        range: z.enum(["1d", "1w", "1m", "3m", "6m", "1yr"]),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ input }) => {
      const startDate = getRangeStart(input.range);
      const records = await prisma.itemRecord.groupBy({
        by: ["itemId"],
        where: {
          loaned: false,
          createdAt: { gte: startDate },
          item: { consumable: { isNot: null } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: input.limit,
      });
      const items = await prisma.item.findMany({
        where: { id: { in: records.map((r) => r.itemId) } },
        select: { id: true, name: true, serial: true },
      });
      const itemMap = new Map(items.map((i) => [i.id, i]));
      return records.map((r) => ({
        name: itemMap.get(r.itemId)?.name ?? "Unknown",
        serial: itemMap.get(r.itemId)?.serial ?? "-",
        consumed: r._sum.quantity ?? 0,
      }));
    }),

  getTopTags: userProcedure
    .meta({
      mcp: {
        name: "dashboard_getTopTags",
        enabled: true,
        description:
          "Get the most used tags ranked by the number of items they are applied to. Accepts a limit parameter (1-20, default 5)",
      },
    })
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ input }) => {
      const tags = await prisma.tag.findMany({
        take: input.limit,
        include: { items: true },
        orderBy: {
          items: {
            _count: "desc",
          },
        },
      });

      return tags.map((tag) => ({
        tagName: tag.name,
        count: tag.items.length,
      }));
    }),
});
