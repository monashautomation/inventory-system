import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import {
  itemRecordUpdateInput,
  itemRecordInput,
} from "@/server/schema/itemRecord.schema";

export const itemRecordRouter = router({
  create: adminProcedure.input(itemRecordInput).mutation(async ({ input }) => {
    return prisma.itemRecord.create({
      data: input,
      include: { actionBy: true, item: true },
    });
  }),

  get: userProcedure
    .meta({
      mcp: {
        name: "itemRecord_get",
        enabled: true,
        description:
          "Get a single transaction record by its ID, including the user and item details",
      },
    })
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.itemRecord.findUnique({
        where: { id: input.id },
        include: { actionBy: true, item: { include: { location: true } } },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        data: itemRecordUpdateInput,
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.itemRecord.update({
        where: { id: input.id },
        data: input.data,
        include: { actionBy: true, item: true },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.itemRecord.delete({
        where: { id: input.id },
      });
    }),

  list: userProcedure
    .meta({
      mcp: {
        name: "itemRecord_list",
        enabled: true,
        description:
          "List transaction records with pagination. Supports filtering by itemId and userId. Max page size is 100, starting from page 0.",
      },
    })
    .input(
      z.object({
        itemId: z.uuid().optional(),
        userId: z.uuid().optional(),
        page: z.number().min(0).default(0), // Add page input
        pageSize: z.number().min(1).max(100).default(10), // Add pageSize input
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const [transactions, totalCount] = await Promise.all([
        prisma.itemRecord.findMany({
          // where,
          include: { actionBy: true, item: { include: { location: true } } },
          orderBy: { createdAt: "desc" },
          skip: page * pageSize, // Pagination: skip records
          take: pageSize, // Pagination: limit records
        }),
        prisma.itemRecord.count(), // Get total count for pagination
      ]);
      return {
        transactions,
        totalCount,
        page,
        pageSize,
        pageCount: Math.ceil(totalCount / pageSize), // Calculate total pages
      };
    }),

  getAuditTrail: userProcedure
    .meta({
      mcp: {
        name: "itemRecord_getAuditTrail",
        enabled: true,
        description:
          "Get the full audit trail (all transaction records) for a specific item by its ID",
      },
    })
    .input(z.object({ itemId: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.itemRecord.findMany({
        where: { itemId: input.itemId },
        include: { actionBy: true },
        // orderBy: { createdAt: "desc" },
      });
    }),

  getUserLoanedItems: userProcedure
    .meta({
      mcp: {
        name: "itemRecord_getUserLoanedItems",
        enabled: true,
        description:
          "Get all items currently loaned by the authenticated user, with their loaned quantities",
      },
    })
    .query(async ({ ctx }) => {
      // Get the currently loaned item IDs for this user
      // This may include items that have already been fully checked in.
      // This will be filtered in the next step.
      const itemIds = await ctx.prisma.itemRecord.findMany({
        where: {
          actionByUserId: ctx.user.id,
          loaned: true,
        },
        select: {
          itemId: true,
        },
        distinct: ["itemId"],
      });

      const currentlyLoaned = (
        await Promise.all(
          itemIds.map(async ({ itemId }) => {
            const itemRecords = await ctx.prisma.itemRecord.findMany({
              where: {
                actionByUserId: ctx.user.id,
                itemId: itemId,
              },
              orderBy: {
                createdAt: "desc", // Fetch the most recent transactions by this user for this item.
              },
              include: {
                item: {
                  include: {
                    location: true,
                    consumable: true,
                  },
                },
                actionBy: true,
              },
            });

            //
            // Determine whether this item is still loaned by this user
            const mostRecentRecord = itemRecords[0];

            // One item result from query, this is loaned
            if (itemRecords.length < 2 && mostRecentRecord.loaned) {
              return {
                ...mostRecentRecord,
                loanedQty: mostRecentRecord.quantity,
              };
            }

            // Handle assets, we only need to look at the most recent transaction
            if (!mostRecentRecord.item.consumable && mostRecentRecord.loaned) {
              return {
                ...mostRecentRecord,
                loanedQty: mostRecentRecord.quantity,
              };
            }

            if (!mostRecentRecord.item.consumable) {
              return undefined;
            }

            // Handle consumables, tally up loaned == true (add) and false (subtract)
            const loanedCount = itemRecords.reduce((acc, record) => {
              const curVal = record.loaned ? record.quantity : -record.quantity;
              return acc + curVal;
            }, 0);

            // Item fully returned, not loaned
            if (loanedCount === 0) {
              return undefined;
            }

            return {
              ...mostRecentRecord,
              loanedQty: loanedCount,
            };
          }),
        )
      ).filter((record) => record !== undefined); // Filter out dud results

      return currentlyLoaned;
    }),
});
