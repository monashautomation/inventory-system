import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { logger as rootLogger } from "@/server/lib/logger";

const logger = rootLogger.child({ module: "router:item" });
import { prisma } from "@/server/lib/prisma";
import { getLocationTreeIds } from "@/server/lib/locationTree";
import { z } from "zod";
import { createItemInput, updateItemInput } from "@/server/schema/item.schema";
import { itemCheckout } from "../utils/item/item.checkout";
import { itemCheckin } from "../utils/item/item.checkin";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { PrintResponse } from "../utils/item/item.utils";
import { itemBulkDelete } from "../utils/item/item.delete";

export const itemRouter = router({
  create: adminProcedure
    .input(
      createItemInput
        .omit({ stored: true, tags: true })
        .extend({ id: z.uuid().optional() }),
    )
    .mutation(async ({ input }) => {
      const baseData = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        locationId: input.locationId,
        cost: input.cost,
        consumable: input.consumable
          ? {
              create: {
                available: input.consumable.available,
                total: input.consumable.total,
              },
            }
          : undefined,
      };

      if (input.serial) {
        return prisma.item.create({
          data: { ...baseData, serial: input.serial },
        });
      }
      return prisma.item.createSerial({ data: baseData });
    }),

  get: userProcedure
    .meta({
      mcp: {
        name: "item_get",
        enabled: true,
        description: "Get the information of an item",
      },
    })

    .input(
      z.object({
        id: z.uuid(),
      }),
    )
    .query(async ({ input }) => {
      return prisma.item.findUnique({
        where: { id: input.id, deleted: false },
        include: {
          location: true,
          tags: true,
          consumable: true,
          notesUpdatedBy: { select: { id: true, name: true } },
          ItemRecords: {
            include: {
              actionBy: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });
    }),

  getBySerial: userProcedure
    .input(z.object({ serial: z.string() }))
    .query(async ({ input }) => {
      return prisma.item.findUnique({
        where: { serial: input.serial, deleted: false },
        select: { id: true, name: true },
      });
    }),

  update: userProcedure
    .input(updateItemInput)
    .mutation(async ({ input, ctx }) => {
      const { id, locationId, consumable, tags, ...rest } = input;
      const itemData = { ...rest };

      // Only admins can modify the storage/lab-use state.
      if (ctx.user.role !== "admin") {
        delete itemData.stored;
      }

      return await prisma.$transaction(async (tx) => {
        const existingItem = await tx.item.findUnique({
          where: { id },
          select: {
            consumable: { select: { id: true } },
            ItemRecords: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        const latestRecord = existingItem?.ItemRecords[0];
        const shouldAutoCheckin =
          ctx.user.role === "admin" &&
          itemData.stored === false &&
          existingItem?.consumable == null &&
          latestRecord?.loaned === true;

        if (shouldAutoCheckin) {
          await tx.itemRecord.create({
            data: {
              loaned: false,
              actionByUserId: ctx.user.id,
              itemId: id,
              quantity: 1,
            },
          });
        }

        const upsertTags = await Promise.all(
          tags.map(async (tag) => {
            const upsertTag = await tx.tag.upsert({
              where: {
                name_type_colour: {
                  name: tag.name,
                  type: tag.type,
                  colour: tag.colour ?? "#000000",
                },
              },
              update: {},
              create: {
                name: tag.name,
                type: tag.type,
                colour: tag.colour,
              },
            });

            return upsertTag;
          }),
        );

        await tx.item.update({
          where: { id: id },
          data: {
            ...itemData,
            location: locationId ? { connect: { id: locationId } } : undefined,
            consumable: consumable
              ? {
                  update: {
                    available: consumable.available,
                    total: consumable.total,
                  },
                }
              : undefined,

            tags: {
              set: upsertTags.map((tag) => ({ id: tag.id })),
            },
          },
        });
      });
    }),

  recover: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.item.update({
        where: { id: input.id },
        data: {
          deleted: false,
        },
      });
    }),
  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.item.update({
        where: { id: input.id },
        data: {
          deleted: true,
        },
      });
    }),

  bulkDelete: adminProcedure
    .input(
      z.object({
        ids: z.array(z.uuid()),
      }),
    )
    .mutation(async ({ input }) => {
      return await itemBulkDelete(input.ids);
    }),

  list: userProcedure
    .meta({
      mcp: {
        name: "item_list",
        enabled: true,
        description:
          "List all the items. The max page size is 100 and it starts from page 0.",
      },
    })
    .input(
      z.object({
        consumable: z.boolean(),
        locationId: z.uuid().optional().nullable(),
        tagGroupId: z.uuid().optional(),
        filter: z.string().optional(),
        exactName: z.string().optional(),
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(10),
        sortBy: z.enum(["name", "serial", "location"]).default("name"),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
      }),
    )
    .query(async ({ input }) => {
      const {
        consumable,
        locationId,
        tagGroupId,
        filter,
        exactName,
        page,
        pageSize,
        sortBy,
        sortOrder,
      } = input;

      let locationIds: string[] | undefined = undefined;
      if (locationId) {
        locationIds = await getLocationTreeIds(locationId);
      }

      // If tagGroupId is provided, get all tags directly from it
      let tagIds: string[] | undefined = undefined;
      if (tagGroupId) {
        const tagGroup = await prisma.tagGroup.findUnique({
          where: { id: tagGroupId },
          include: { tags: { select: { id: true } } },
        });

        if (tagGroup) {
          tagIds = tagGroup.tags.map((tag) => tag.id);
        }
      }

      // Build the where clause
      const where = {
        consumable: consumable ? { isNot: null } : { is: null },
        deleted: false,
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
        ...(tagIds && tagIds.length > 0
          ? {
              tags: {
                some: {
                  id: { in: tagIds },
                },
              },
            }
          : {}),
        ...(exactName
          ? {
              name: {
                equals: exactName,
                mode: "insensitive" as const,
              },
            }
          : filter
            ? {
                OR: [
                  {
                    name: {
                      contains: filter,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    tags: {
                      some: {
                        name: {
                          contains: filter,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
      };

      const orderBy =
        sortBy === "serial"
          ? { serial: sortOrder }
          : sortBy === "location"
            ? { location: { name: sortOrder } }
            : { name: sortOrder };

      // Fetch paginated items and total count concurrently
      const [items, totalCount] = await Promise.all([
        prisma.item.findMany({
          where,
          include: {
            location: true,
            tags: true,
            consumable: true,
            ItemRecords: true,
          },
          orderBy,
          skip: page * pageSize,
          take: pageSize,
        }),
        prisma.item.count({ where }),
      ]);

      return {
        items,
        totalCount,
        page,
        pageSize,
        pageCount: Math.ceil(totalCount / pageSize),
      };
    }),

  listForAssets: userProcedure
    .input(
      z.object({
        locationId: z.uuid().optional().nullable(),
        tagGroupId: z.uuid().optional(),
        filter: z.string().optional(),
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(10),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
      }),
    )
    .query(async ({ input }) => {
      const { locationId, tagGroupId, filter, page, pageSize, sortOrder } =
        input;

      let locationIds: string[] | undefined = undefined;
      if (locationId) {
        locationIds = await getLocationTreeIds(locationId);
      }

      let tagIds: string[] | undefined = undefined;
      if (tagGroupId) {
        const tagGroup = await prisma.tagGroup.findUnique({
          where: { id: tagGroupId },
          include: { tags: { select: { id: true } } },
        });
        if (tagGroup) {
          tagIds = tagGroup.tags.map((tag) => tag.id);
        }
      }

      // Base structural filters (no text search) — used to fetch all sibling items
      const baseWhere = {
        consumable: { is: null },
        deleted: false,
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
        ...(tagIds && tagIds.length > 0
          ? { tags: { some: { id: { in: tagIds } } } }
          : {}),
      };

      // Text search added on top for the name-discovery step
      const filteredWhere = {
        ...baseWhere,
        ...(filter
          ? {
              OR: [
                { name: { contains: filter, mode: "insensitive" as const } },
                {
                  tags: {
                    some: {
                      name: { contains: filter, mode: "insensitive" as const },
                    },
                  },
                },
              ],
            }
          : {}),
      };

      // Step 1: paginate distinct names that match the filter
      const [nameGroups, allNameGroups] = await Promise.all([
        prisma.item.groupBy({
          by: ["name"],
          where: filteredWhere,
          skip: page * pageSize,
          take: pageSize,
          orderBy: { name: sortOrder },
        }),
        prisma.item.groupBy({
          by: ["name"],
          where: filteredWhere,
        }),
      ]);

      const totalCount = allNameGroups.length;
      const names = nameGroups.map((g) => g.name);

      // Step 2: fetch ALL items for those names (no text filter — show all siblings)
      const items =
        names.length > 0
          ? await prisma.item.findMany({
              where: { ...baseWhere, name: { in: names } },
              include: {
                location: true,
                tags: true,
                consumable: true,
                ItemRecords: true,
              },
              orderBy: { name: sortOrder },
            })
          : [];

      return {
        items,
        totalCount,
        page,
        pageSize,
        pageCount: Math.ceil(totalCount / pageSize),
      };
    }),

  checkoutCart: userProcedure
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
    .mutation(async ({ ctx, input }) => {
      return await itemCheckout(ctx.user.id, input);
    }),

  adminCheckoutCart: adminProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        cart: z
          .array(
            z.object({
              itemId: z.uuid(),
              quantity: z.number().min(1),
            }),
          )
          .nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await itemCheckout(input.targetUserId, input.cart, ctx.user.id);
    }),

  checkinCart: userProcedure
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
    .mutation(async ({ ctx, input }) => {
      return await itemCheckin(ctx.user.id, input);
    }),

  adminCheckinCart: adminProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        cart: z
          .array(
            z.object({
              itemId: z.uuid(),
              quantity: z.number().min(1),
            }),
          )
          .nonempty(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await itemCheckin(input.targetUserId, input.cart, ctx.user.id);
    }),

  getImageUrl: userProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      const item = await prisma.item.findUnique({
        where: { id: input.id, deleted: false },
        select: { image: true },
      });
      if (!item?.image) return null;
      return `/api/items/${input.id}/image`;
    }),

  countByName: userProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      const item = await prisma.item.findUnique({
        where: { id: input.id, deleted: false },
        select: { name: true },
      });
      if (!item) return 0;
      return prisma.item.count({
        where: { name: item.name, deleted: false, id: { not: input.id } },
      });
    }),

  updateNote: userProcedure
    .input(
      z.object({
        id: z.uuid(),
        notes: z.string().max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.item.update({
        where: { id: input.id, deleted: false },
        data: {
          notes: input.notes || null,
          notesUpdatedByUserId: ctx.user.id,
          notesUpdatedAt: new Date(),
        },
        select: {
          notes: true,
          notesUpdatedAt: true,
          notesUpdatedBy: { select: { id: true, name: true } },
        },
      });
    }),

  printLabel: userProcedure
    .input(
      z.object({
        itemId: z.uuid(),
        quantity: z.number().positive(),
        labelType: z
          .union([z.literal(0), z.literal(1), z.literal(2)])
          .default(0),
      }),
    )
    .mutation(async ({ input }) => {
      const { itemId, quantity, labelType } = input;
      try {
        // Verify that the itemId is valid
        const item = await prisma.item.findUniqueOrThrow({
          where: { id: itemId },
          select: {
            name: true,
            serial: true,
          },
        });
        const { serial, name } = item;
        // Make request to the printer server
        let response;
        try {
          logger.debug(
            { url: process.env.PRINTER_URL ?? "http://localhost:6767/printer" },
            "Printing via printer server",
          );
          response = await fetch(
            process.env.PRINTER_URL ?? "http://localhost:6767/printer",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.PRINTER_TOKEN}`,
              },
              body: JSON.stringify({
                name: name,
                serial: serial,
                quantity: quantity,
                itemId: itemId,
                labelType: labelType,
              }),
              // Add 5 second time out to prevent over-printing
              signal: AbortSignal.timeout(5000),
            },
          );
        } catch (e) {
          logger.error({ err: e }, "Cannot reach printer server");
          return {
            ok: false as const,
            error: `Cannot reach printer server`,
          };
        }
        // Check HTTP status
        if (!response.ok) {
          const body = await response.text();
          logger.error(
            { status: response.status, body },
            "Printer server error",
          );
          return {
            ok: false as const,
            error: `Printer server error: ${response.status}`,
          };
        }
        // Parse JSON response
        let data;
        try {
          data = (await response.json()) as PrintResponse;
        } catch {
          return {
            ok: false as const,
            error: `Invalid response from printer server`,
          };
        }
        if (!data.ok) {
          return {
            ok: false as const,
            error: data.error || "Print failed",
          };
        }
        return {
          ok: true as const,
          itemId: itemId,
        };
      } catch (error) {
        if (error instanceof PrismaClientKnownRequestError) {
          if (error.code === "P2025") {
            return {
              ok: false as const,
              error: `Item not found`,
            };
          }
        }
        return {
          ok: false as const,
          error: `Failed to process print request`,
        };
      }
    }),
});
