import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import {
  locationGetInput,
  locationInput,
  locationUpdateInput,
} from "@/server/schema/location.schema";
import type { Prisma } from "@prisma/client";

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
  getRoots: userProcedure.query(async () => {
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
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.location.delete({
        where: { id: input.id },
      });
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
