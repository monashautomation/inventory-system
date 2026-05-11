import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSupplierInput,
  updateSupplierInput,
  setPrimarySupplierInput,
} from "@/server/schema/consumableSupplier.schema";

export const consumableSupplierRouter = router({
  create: adminProcedure
    .input(createSupplierInput)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        if (input.isPrimary) {
          await tx.consumableSupplier.updateMany({
            where: { consumableId: input.consumableId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.consumableSupplier.create({
          data: {
            consumableId: input.consumableId,
            name: input.name,
            url: input.url,
            sku: input.sku ?? null,
            notes: input.notes ?? null,
            isPrimary: input.isPrimary ?? false,
            createdById: ctx.user.id,
          },
        });
      });
    }),

  update: adminProcedure
    .input(updateSupplierInput)
    .mutation(async ({ input }) => {
      return prisma.consumableSupplier.update({
        where: { id: input.id },
        data: {
          ...(input.data.name !== undefined && { name: input.data.name }),
          ...(input.data.url !== undefined && { url: input.data.url }),
          ...(input.data.sku !== undefined && { sku: input.data.sku }),
          ...(input.data.notes !== undefined && { notes: input.data.notes }),
        },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.consumableSupplier.delete({ where: { id: input.id } });
    }),

  setPrimary: adminProcedure
    .input(setPrimarySupplierInput)
    .mutation(async ({ input }) => {
      return prisma.$transaction(async (tx) => {
        await tx.consumableSupplier.updateMany({
          where: { consumableId: input.consumableId, isPrimary: true },
          data: { isPrimary: false },
        });
        if (input.supplierId) {
          const supplier = await tx.consumableSupplier.findUnique({
            where: { id: input.supplierId },
          });
          if (!supplier || supplier.consumableId !== input.consumableId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Supplier does not belong to this consumable",
            });
          }
          await tx.consumableSupplier.update({
            where: { id: input.supplierId },
            data: { isPrimary: true },
          });
        }
        return { ok: true as const };
      });
    }),

  listForConsumable: userProcedure
    .input(z.object({ consumableId: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.consumableSupplier.findMany({
        where: { consumableId: input.consumableId },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      });
    }),
});
