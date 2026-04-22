import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  locationGetInput,
  locationInput,
  locationUpdateInput,
} from "@/server/schema/location.schema";
import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

async function collectDescendantIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  const children = await prisma.location.findMany({
    where: { parentId: rootId },
    select: { id: true },
  });
  for (const child of children) {
    ids.push(...(await collectDescendantIds(child.id)));
  }
  return ids;
}

export const locationRouter = router({
  create: adminProcedure.input(locationInput).mutation(async ({ input }) => {
    return prisma.location.create({
      data: input,
    });
  }),

  get: userProcedure
    .meta({
      mcp: {
        name: "location_get",
        enabled: true,
        description: "Get the information of a location by ID or name.",
      },
    })
    .input(locationGetInput)
    .query(async ({ input }) => {
      // Construct OR conditions without undefined
      const orConditions: Prisma.LocationWhereInput[] = [];
      if (input.id) {
        orConditions.push({ id: input.id });
      }
      if (input.name) {
        orConditions.push({ name: input.name });
      }

      return prisma.location.findFirst({
        where: {
          OR: orConditions.length > 0 ? orConditions : undefined,
        },
        include: {
          parent: true,
          children: true,
          items: true,
        },
      });
    }),
  // Get root locations.
  getRoots: userProcedure
    .meta({
      mcp: {
        name: "location_getRoots",
        enabled: true,
        description:
          "Get all root locations (top-level locations with no parent)",
      },
    })
    .query(async () => {
      return prisma.location.findMany({
        where: {
          parentId: null,
        },
        include: {
          parent: true,
          children: true,
          items: true,
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  getChildren: userProcedure
    .meta({
      mcp: {
        name: "location_getChildren",
        enabled: true,
        description: "Get all child locations under a given parent location ID",
      },
    })
    .input(z.object({ parentId: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.location.findMany({
        where: {
          parentId: input.parentId,
        },
        include: {
          parent: true,
          children: true,
          items: true,
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  hasChildren: userProcedure
    .meta({
      mcp: {
        name: "location_hasChildren",
        enabled: true,
        description:
          "Check whether a location has any child locations. Returns true or false",
      },
    })
    .input(z.object({ locationId: z.uuid() }))
    .query(async ({ input }) => {
      const count = await prisma.location.count({
        where: {
          parentId: input.locationId,
        },
      });
      return count > 0;
    }),

  update: adminProcedure
    .input(z.object({ id: z.uuid(), data: locationUpdateInput }))
    .mutation(async ({ input }) => {
      return prisma.location.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        forceDeleteArchivedItems: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const allIds = await collectDescendantIds(input.id);

      try {
        return await prisma.$transaction(async (tx) => {
          const [activeItemCount, archivedItemCount] = await Promise.all([
            tx.item.count({
              where: {
                locationId: { in: allIds },
                deleted: false,
              },
            }),
            tx.item.count({
              where: {
                locationId: { in: allIds },
                deleted: true,
              },
            }),
          ]);

          if (activeItemCount > 0) {
            const noun = activeItemCount > 1 ? "items" : "item";
            const verb = activeItemCount > 1 ? "are" : "is";

            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Cannot delete: ${activeItemCount} active ${noun} ${verb} still assigned to this location or its children. Move them first.`,
            });
          }

          if (archivedItemCount > 0 && !input.forceDeleteArchivedItems) {
            const noun = archivedItemCount > 1 ? "items" : "item";

            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `ARCHIVED_DELETE_CONFIRMATION_REQUIRED:${archivedItemCount}:${noun}`,
            });
          }

          if (archivedItemCount > 0 && input.forceDeleteArchivedItems) {
            const archivedItems = await tx.item.findMany({
              where: {
                locationId: { in: allIds },
                deleted: true,
              },
              select: { id: true },
            });

            const archivedItemIds = archivedItems.map((item) => item.id);

            if (archivedItemIds.length > 0) {
              await tx.itemRecord.deleteMany({
                where: {
                  itemId: { in: archivedItemIds },
                },
              });

              await tx.consumable.deleteMany({
                where: {
                  itemId: { in: archivedItemIds },
                },
              });

              await tx.item.deleteMany({
                where: {
                  id: { in: archivedItemIds },
                  deleted: true,
                },
              });
            }
          }

          await tx.location.updateMany({
            where: { id: { in: allIds } },
            data: { parentId: null },
          });
          await tx.location.deleteMany({
            where: { id: { in: allIds } },
          });
        });
      } catch (error) {
        const prismaError = error as PrismaClientKnownRequestError;

        if (prismaError.code === "P2003") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Cannot delete location: one or more items were assigned during deletion. Refresh and try again.",
          });
        }

        throw error;
      }
    }),

  list: userProcedure
    .meta({
      mcp: {
        name: "location_list",
        enabled: true,
        description: "List all availible locations",
      },
    })
    .query(async () => {
      return prisma.location.findMany({
        include: {
          parent: true,
          children: true,
          items: true,
        },
      });
    }),
});
