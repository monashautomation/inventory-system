import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import {
  consumableInput,
  consumableUpdateInput,
} from "@/server/schema/consumable.schema";
import { consumableRestock } from "../utils/consumable/consumable.restock";

export const consumableRouter = router({
  create: adminProcedure.input(consumableInput).mutation(async ({ input }) => {
    return await prisma.consumable.create({
      data: input,
      include: { item: true },
    });
  }),

  get: userProcedure
    .input(
      z.object({
        id: z.uuid(),
      }),
    )
    .query(async ({ input }) => {
      return await prisma.consumable.findUnique({
        where: { id: input.id },
        include: {
          item: true,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        data: consumableUpdateInput,
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.consumable.update({
        where: { id: input.id },
        data: input.data,
        include: { item: true },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.consumable.delete({
        where: { id: input.id },
      });
    }),

  list: userProcedure.query(async () => {
    return prisma.consumable.findMany({
      include: { item: true },
    });
  }),

  restock: adminProcedure
    .input(
      z
        .array(
          z.object({
            itemId: z.uuid(),
            quantity: z.number().min(1),
          }),
        )
        .nonempty(),
    )
    .mutation(async ({ input }) => {
      return await consumableRestock(input);
    }),
});
