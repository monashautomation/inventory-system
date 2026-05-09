import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createRequestInput,
  updateRequestStatusInput,
  listRequestsInput,
} from "@/server/schema/consumableRequest.schema";
import { resolvePrimarySupplierId } from "../utils/consumableRequest/primarySupplier";

const requestInclude = {
  consumable: {
    include: { item: { select: { id: true, name: true, serial: true } } },
  },
  requestedBy: { select: { id: true, name: true, email: true } },
  purchasedBy: { select: { id: true, name: true, email: true } },
  supplier: true,
} as const;

export const consumableRequestRouter = router({
  create: userProcedure
    .input(createRequestInput)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        const consumable = await tx.consumable.findUnique({
          where: { id: input.consumableId },
          select: { id: true },
        });
        if (!consumable) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Consumable not found",
          });
        }

        let supplierId = input.supplierId ?? null;
        let customSupplier = input.customSupplier ?? null;
        let customUrl = input.customUrl ?? null;

        if (supplierId) {
          const supplier = await tx.consumableSupplier.findUnique({
            where: { id: supplierId },
            select: { id: true, consumableId: true },
          });
          if (!supplier || supplier.consumableId !== input.consumableId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected supplier does not belong to this consumable",
            });
          }
          customSupplier = null;
          customUrl = null;
        } else if (!customSupplier && !customUrl) {
          // Fall back to resolved primary supplier (may be null).
          supplierId = await resolvePrimarySupplierId(tx, input.consumableId);
        }

        return tx.consumableRequest.create({
          data: {
            consumableId: input.consumableId,
            requestedById: ctx.user.id,
            quantity: input.quantity,
            supplierId,
            customSupplier,
            customUrl,
            notes: input.notes ?? null,
          },
          include: requestInclude,
        });
      });
    }),

  list: adminProcedure
    .input(listRequestsInput)
    .query(async ({ input }) => {
      const where = {
        ...(input.status && { status: input.status }),
        ...(input.consumableId && { consumableId: input.consumableId }),
        ...(input.requestedById && { requestedById: input.requestedById }),
      };

      const [items, totalCount] = await prisma.$transaction([
        prisma.consumableRequest.findMany({
          where,
          include: requestInclude,
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          skip: input.page * input.pageSize,
          take: input.pageSize,
        }),
        prisma.consumableRequest.count({ where }),
      ]);

      return { items, totalCount };
    }),

  listMine: userProcedure
    .input(
      z
        .object({
          status: z
            .enum(["PENDING", "ORDERED", "RECEIVED", "CANCELLED"])
            .optional(),
        })
        .default({}),
    )
    .query(async ({ input, ctx }) => {
      return prisma.consumableRequest.findMany({
        where: {
          requestedById: ctx.user.id,
          ...(input.status && { status: input.status }),
        },
        include: requestInclude,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),

  pendingCount: adminProcedure.query(async () => {
    return prisma.consumableRequest.count({ where: { status: "PENDING" } });
  }),

  updateStatus: adminProcedure
    .input(updateRequestStatusInput)
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.consumableRequest.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            status: true,
            consumableId: true,
            quantity: true,
            fulfilledQty: true,
          },
        });
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Request not found",
          });
        }

        if (
          existing.status === "RECEIVED" ||
          existing.status === "CANCELLED"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Request is already ${existing.status} and cannot be changed`,
          });
        }

        const data: Record<string, unknown> = { status: input.status };

        if (input.status === "ORDERED") {
          data.purchasedById = ctx.user.id;
          data.purchasedAt = new Date();
        }

        if (input.status === "RECEIVED") {
          if (existing.status === "PENDING") {
            // Implicit purchase on direct receive.
            data.purchasedById = ctx.user.id;
            data.purchasedAt = new Date();
          }
          const fulfilledQty = input.fulfilledQty ?? existing.quantity;
          data.fulfilledQty = fulfilledQty;
          data.receivedAt = new Date();

          await tx.consumable.update({
            where: { id: existing.consumableId },
            data: {
              available: { increment: fulfilledQty },
              total: { increment: fulfilledQty },
            },
          });
        }

        if (input.status === "CANCELLED") {
          data.cancelReason = input.cancelReason ?? null;
        }

        return tx.consumableRequest.update({
          where: { id: input.id },
          data,
          include: requestInclude,
        });
      });
    }),

  cancel: userProcedure
    .input(
      z.object({
        id: z.uuid(),
        cancelReason: z.string().max(500).optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.consumableRequest.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, requestedById: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found",
        });
      }
      const isOwner = existing.requestedById === ctx.user.id;
      const isAdmin = ctx.user.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (existing.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending requests can be cancelled",
        });
      }
      return prisma.consumableRequest.update({
        where: { id: input.id },
        data: {
          status: "CANCELLED",
          cancelReason: input.cancelReason ?? null,
        },
        include: requestInclude,
      });
    }),
});
