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
import { emitRequestStatusNotification } from "../utils/notification/emit";
import { writeAuditLog } from "../utils/audit/log";

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
          include: { item: { select: { name: true } } },
        });
        if (!consumable) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Consumable not found",
          });
        }

        // Dupe guard: one pending request per user per consumable
        const existing = await tx.consumableRequest.findFirst({
          where: {
            consumableId: input.consumableId,
            requestedById: ctx.user.id,
            status: "PENDING",
          },
          select: { id: true },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already have a pending request for this item",
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
          supplierId = await resolvePrimarySupplierId(tx, input.consumableId);
        }

        const request = await tx.consumableRequest.create({
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

        await writeAuditLog(tx, {
          action: "REQUEST_CREATED",
          actorId: ctx.user.id,
          entityType: "ConsumableRequest",
          entityId: request.id,
          after: {
            status: "PENDING",
            quantity: request.quantity,
            supplierId: request.supplierId,
            customSupplier: request.customSupplier,
          },
        });

        return request;
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
          page: z.number().int().min(0).default(0),
          pageSize: z.number().int().min(1).max(100).default(25),
        })
        .default({ page: 0, pageSize: 25 }),
    )
    .query(async ({ input, ctx }) => {
      const where = {
        requestedById: ctx.user.id,
        ...(input.status && { status: input.status }),
      };

      const [items, totalCount] = await prisma.$transaction([
        prisma.consumableRequest.findMany({
          where,
          include: requestInclude,
          orderBy: { createdAt: "desc" },
          skip: input.page * input.pageSize,
          take: input.pageSize,
        }),
        prisma.consumableRequest.count({ where }),
      ]);

      return { items, totalCount };
    }),

  pendingCount: adminProcedure.query(async () => {
    return prisma.consumableRequest.count({ where: { status: "PENDING" } });
  }),

  myPendingCount: userProcedure.query(async ({ ctx }) => {
    const count = await prisma.consumableRequest.count({
      where: { requestedById: ctx.user.id, status: "PENDING" },
    });
    return { count };
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
            requestedById: true,
            consumable: {
              include: { item: { select: { name: true } } },
            },
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

        const prevStatus = existing.status;
        const data: Record<string, unknown> = { status: input.status };

        if (input.status === "ORDERED") {
          data.purchasedById = ctx.user.id;
          data.purchasedAt = new Date();
        }

        if (input.status === "RECEIVED") {
          if (existing.status === "PENDING") {
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

        const updated = await tx.consumableRequest.update({
          where: { id: input.id },
          data,
          include: requestInclude,
        });

        const itemName = existing.consumable.item?.name ?? "Unknown item";

        await writeAuditLog(tx, {
          action:
            input.status === "RECEIVED"
              ? "REQUEST_RECEIVED"
              : input.status === "CANCELLED"
                ? "REQUEST_CANCELLED"
                : "REQUEST_STATUS_CHANGED",
          actorId: ctx.user.id,
          entityType: "ConsumableRequest",
          entityId: input.id,
          before: { status: prevStatus },
          after: {
            status: input.status,
            fulfilledQty: data.fulfilledQty ?? null,
            cancelReason: data.cancelReason ?? null,
          },
        });

        await emitRequestStatusNotification(tx, {
          request: {
            id: existing.id,
            requestedById: existing.requestedById,
            quantity: existing.quantity,
            fulfilledQty: (data.fulfilledQty as number | undefined) ?? null,
          },
          newStatus: input.status,
          itemName,
          actorId: ctx.user.id,
        });

        return updated;
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
      return prisma.$transaction(async (tx) => {
        const existing = await tx.consumableRequest.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            status: true,
            requestedById: true,
            consumable: {
              include: { item: { select: { name: true } } },
            },
          },
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

        const updated = await tx.consumableRequest.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            cancelReason: input.cancelReason ?? null,
          },
          include: requestInclude,
        });

        await writeAuditLog(tx, {
          action: "REQUEST_CANCELLED",
          actorId: ctx.user.id,
          entityType: "ConsumableRequest",
          entityId: input.id,
          before: { status: "PENDING" },
          after: { status: "CANCELLED" },
          metadata: { cancelReason: input.cancelReason ?? null },
        });

        return updated;
      });
    }),
});
