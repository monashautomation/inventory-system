import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import { groupInput, groupUpdateInput } from "@/server/schema/group.schema";

export const groupRouter = router({
  create: adminProcedure.input(groupInput).mutation(async ({ input }) => {
    return await prisma.group.create({
      data: input,
    });
  }),

  get: userProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.group.findUnique({
        where: { id: input.id },
        include: {
          users: true,
          parent: true,
          children: true,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        data: groupUpdateInput,
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.group.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.group.delete({
        where: { id: input.id },
      });
    }),

  list: userProcedure.query(async () => {
    return prisma.group.findMany({
      include: {
        users: true,
        parent: true,
        children: true,
      },
    });
  }),
});
