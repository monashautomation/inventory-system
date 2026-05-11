import { router, userProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { listNotificationsInput, markReadInput } from "@/server/schema/notification.schema";
import { z } from "zod";

export const notificationRouter = router({
  list: userProcedure
    .input(listNotificationsInput)
    .query(async ({ input, ctx }) => {
      return prisma.notification.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.unreadOnly && { readAt: null }),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  unreadCount: userProcedure.query(async ({ ctx }) => {
    const count = await prisma.notification.count({
      where: { userId: ctx.user.id, readAt: null },
    });
    return { count };
  }),

  markRead: userProcedure
    .input(markReadInput)
    .mutation(async ({ input, ctx }) => {
      await prisma.notification.updateMany({
        where: {
          id: { in: input.ids },
          userId: ctx.user.id,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }),

  markAllRead: userProcedure.mutation(async ({ ctx }) => {
    await prisma.notification.updateMany({
      where: { userId: ctx.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }),

  dismiss: userProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.notification.deleteMany({
        where: { id: input.id, userId: ctx.user.id },
      });
    }),
});
