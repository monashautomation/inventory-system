import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
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
          ItemRecords: true,
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
        page: z.number().min(0).default(0),
        pageSize: z.number().min(1).max(100).default(10),
      }),
    )
    .query(async ({ input }) => {
      const { consumable, locationId, tagGroupId, filter, page, pageSize } =
        input;

      // If locationId is provided, get all descendant location IDs including itself
      let locationIds: string[] | undefined = undefined;
      if (locationId) {
        const locations = await prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE location_tree AS (
          SELECT id FROM "Location" WHERE id = ${locationId}
          UNION ALL
          SELECT l.id FROM "Location" l
          INNER JOIN location_tree lt ON l."parentId" = lt.id
        )
        SELECT id FROM location_tree
      `;
        locationIds = locations.map((loc) => loc.id);
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
        ...(filter
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
          console.log(
            `Printing via: ${process.env.PRINTER_URL ?? "http://localhost:6767/printer"}`,
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
          console.log(e);
          return {
            ok: false as const,
            error: `Cannot reach printer server`,
          };
        }
        // Check HTTP status
        if (!response.ok) {
          const body = await response.text();
          console.log(`Printer server ${response.status} body:`, body);
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
