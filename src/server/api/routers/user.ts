import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import { userInput, userUpdateInput } from "@/server/schema/user.schema";

export const userRouter = router({
  create: adminProcedure.input(userInput).mutation(async ({ input }) => {
    return prisma.user.create({
      data: input,
    });
  }),

  get: userProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.user.findUnique({
        where: { id: input.id },
        include: {
          group: true,
          ItemRecords: true,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({ id: z.uuid(), data: userUpdateInput }))
    .mutation(async ({ input }) => {
      return prisma.user.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.user.delete({
        where: { id: input.id },
      });
    }),

  list: userProcedure.query(async () => {
    return prisma.user.findMany({
      include: {
        group: true,
        ItemRecords: true,
      },
    });
  }),
});
