import { router, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { listAuditLogsInput, forEntityInput } from "@/server/schema/auditLog.schema";

const auditInclude = {
  actor: { select: { id: true, name: true, email: true } },
} as const;

export const auditLogRouter = router({
  list: adminProcedure
    .input(listAuditLogsInput)
    .query(async ({ input }) => {
      const where = {
        ...(input.entityType && { entityType: input.entityType }),
        ...(input.entityId && { entityId: input.entityId }),
        ...(input.actorId && { actorId: input.actorId }),
        ...(input.action && { action: input.action }),
      };

      const [items, totalCount] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          include: auditInclude,
          orderBy: { createdAt: "desc" },
          skip: input.page * input.pageSize,
          take: input.pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return { items, totalCount };
    }),

  forEntity: adminProcedure
    .input(forEntityInput)
    .query(async ({ input }) => {
      return prisma.auditLog.findMany({
        where: { entityType: input.entityType, entityId: input.entityId },
        include: auditInclude,
        orderBy: { createdAt: "asc" },
      });
    }),
});
