import { router, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import {
  listAuditLogsInput,
  forEntityInput,
} from "@/server/schema/auditLog.schema";
import { resolveAvatarUrl } from "@/server/lib/avatar";

const auditInclude = {
  actor: { select: { id: true, name: true, email: true, image: true } },
} as const;

function resolveActors<
  T extends {
    actor: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    } | null;
  },
>(items: T[]) {
  return items.map((item) => ({
    ...item,
    actor: item.actor
      ? {
          ...item.actor,
          image: resolveAvatarUrl(item.actor.id, item.actor.image),
        }
      : null,
  }));
}

export const auditLogRouter = router({
  list: adminProcedure.input(listAuditLogsInput).query(async ({ input }) => {
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

    return { items: resolveActors(items), totalCount };
  }),

  forEntity: adminProcedure.input(forEntityInput).query(async ({ input }) => {
    const items = await prisma.auditLog.findMany({
      where: { entityType: input.entityType, entityId: input.entityId },
      include: auditInclude,
      orderBy: { createdAt: "asc" },
    });
    return resolveActors(items);
  }),
});
