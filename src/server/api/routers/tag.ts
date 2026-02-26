import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import { tagInput, tagUpdateInput } from "@/server/schema/tag.schema";

export const tagRouter = router({
  create: adminProcedure.input(tagInput).mutation(async ({ input }) => {
    return prisma.tag.create({
      data: input,
    });
  }),

  get: userProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.tag.findUnique({
        where: { id: input.id },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        data: tagUpdateInput,
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.tag.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.tag.delete({
        where: { id: input.id },
      });
    }),

  list: userProcedure.query(async () => {
    return prisma.tag.findMany({});
  }),
});
