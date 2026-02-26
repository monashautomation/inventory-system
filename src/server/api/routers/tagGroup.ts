import { userProcedure, adminProcedure, router } from "@/server/trpc";
import z from "zod";
import { prisma } from "@/server/lib/prisma";
import { Prisma, type TagGroup } from "@prisma/client";
import {
  collectDescendantsAndParent,
  isDescendant,
  traverseToRoot,
} from "../utils/tagGroup/tagGroup.utils";

export const tagGroupRouter = router({
  create: adminProcedure
    .input(
      z.object({
        parentId: z.uuid().optional(),
        name: z
          .string()
          .min(1, "TagGroup name is required")
          .max(200, "Name too long (max 200 chars)"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // create the name tagGroup
        await prisma.tagGroup.create({
          data: {
            name: input.name,
            parentId: input.parentId ?? null,
          },
        });
        return {
          ok: true as const,
          name: input.name,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2003") {
            return {
              ok: false as const,
              error: `Parent id: ${input.parentId} does not exist`,
            };
          }
          if (error.code === "P2002") {
            return {
              ok: false as const,
              error: `TagGroup with name "${input.name}" already exists`,
            };
          }
        }
        return {
          ok: false as const,
          error: `Unknown Error: could not create tagGroup with name ${input.name}`,
        };
      }
    }),

  createMany: adminProcedure
    .input(
      z.object({
        parentId: z.uuid(),
        tagNames: z
          .array(
            z
              .string()
              .min(1, "TagGroup name is required")
              .max(200, "Name too long (max 200 chars)"),
          )
          .nonempty(),
      }),
    )
    .mutation(async ({ input }) => {
      const { parentId, tagNames } = input;

      try {
        await prisma.$transaction(async (tx) => {
          // Check for existing tag names
          const existingTags = await tx.tagGroup.findMany({
            where: { name: { in: tagNames } },
            select: { name: true },
          });

          if (existingTags.length > 0) {
            const duplicateNames = existingTags
              .map((tag) => tag.name)
              .join(", ");
            throw new Error(`DUPLICATE_TAGS:${duplicateNames}`);
          }

          // Create the tags with the corresponding parentId
          const data = tagNames.map((name) => ({
            name: name,
            parentId: parentId ?? null,
          }));

          await tx.tagGroup.createMany({
            data: data,
          });
        });

        return {
          ok: true as const,
          names: tagNames,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("DUPLICATE_TAGS:")
        ) {
          const duplicates = error.message.split(":")[1];
          return {
            ok: false as const,
            error: `Cannot create duplicate tag names: ${duplicates}`,
          };
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2003") {
            return {
              ok: false as const,
              error: `Parent id: ${input.parentId} does not exist`,
            };
          }
        }

        return {
          ok: false as const,
          error: `Unknown Error: could not create tagGroups with names: ${input.tagNames.join(", ")}`,
        };
      }
    }),

  move: adminProcedure
    .input(
      z.object({
        parentId: z.uuid(),
        tagGroupsToMove: z.array(z.uuid()).nonempty(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Check if the tagGroups are existing
        const existingTagGroups = await prisma.tagGroup.findMany({
          where: { id: { in: input.tagGroupsToMove } },
        });

        if (existingTagGroups.length !== input.tagGroupsToMove.length) {
          return {
            ok: false as const,
            error: `One or more TagGroups to move do not exist`,
          };
        }

        // Check for circular references between parent and tagGroupsToMove
        const circularChecks = await Promise.all(
          input.tagGroupsToMove.map((tagGroupId) =>
            isDescendant(tagGroupId, input.parentId),
          ),
        );
        const hasCircularReference = circularChecks.includes(true);
        if (hasCircularReference)
          return {
            ok: false,
            error: `Cannot move TagGroup under its own descendant`,
          };

        // Update all the children to have their parents point to the parentId
        await prisma.tagGroup.updateMany({
          where: {
            id: { in: input.tagGroupsToMove },
          },
          data: { parentId: input.parentId },
        });

        return {
          ok: true as const,
          data: input,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2003") {
            return {
              ok: false as const,
              error: `ParentId does not exist`,
            };
          }
        }
        return {
          ok: false as const,
          error: `Unknown Error: could not move tagGroup to parent`,
        };
      }
    }),

  listChildren: userProcedure
    .input(
      z.object({
        parentId: z.uuid(),
      }),
    )
    .query(async ({ input }) => {
      try {
        // Check if the parentId is valid or not
        await prisma.tagGroup.findUniqueOrThrow({
          where: { id: input.parentId },
        });
        const descendantsAndParent = await collectDescendantsAndParent(
          input.parentId,
        );
        return {
          ok: true as const,
          // Filter out the parentId - should only list the children
          descendants: descendantsAndParent.filter(
            (tagGroup) => tagGroup.id !== input.parentId,
          ),
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025")
            return {
              ok: false as const,
              error: `Parent id does not exist`,
            };
        }
        return {
          ok: false as const,
          error: `Unknown Error: could not move tagGroup to parent`,
        };
      }
    }),

  cascadeDelete: adminProcedure
    .input(
      z.object({
        parentId: z.uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Check if the parentId is valid or not
        await prisma.tagGroup.findUniqueOrThrow({
          where: { id: input.parentId },
        });
        const tagGroupsToDelete = await collectDescendantsAndParent(
          input.parentId,
        );
        // Delete all children AND the parent
        await prisma.tagGroup.deleteMany({
          where: {
            id: { in: tagGroupsToDelete.map((tagGroup) => tagGroup.id) },
          },
        });
        return {
          ok: true as const,
          deleted: tagGroupsToDelete,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025")
            return {
              ok: false as const,
              error: `Parent id does not exist`,
            };
        }
        return {
          ok: false as const,
          error: `Unknown Error: could not move tagGroup to parent`,
        };
      }
    }),

  delete: adminProcedure
    .input(
      z.object({
        tagGroupId: z.uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Verify that the tagGroup exists within the database
        const tagGroupToDelete = await prisma.tagGroup.findUniqueOrThrow({
          where: { id: input.tagGroupId },
          include: { children: true },
        });

        // If the object has no children then we just remove it directly
        if (tagGroupToDelete.children.length === 0) {
          await prisma.tagGroup.delete({
            where: { id: input.tagGroupId },
          });

          return {
            ok: true as const,
            deleted: input.tagGroupId,
          };
        }
        // Prevent removing the root tag group
        if (!tagGroupToDelete.parentId)
          return {
            ok: false as const,
            error: `Cannot delete root tagGroup`,
          };
        // Assign the children of the node we want to delete to its parent
        await prisma.tagGroup.updateMany({
          where: { id: { in: tagGroupToDelete.children.map((c) => c.id) } },
          data: { parentId: tagGroupToDelete.parentId },
        });
        // Delete the node
        await prisma.tagGroup.delete({
          where: { id: input.tagGroupId },
        });
        return {
          ok: true as const,
          deleted: input.tagGroupId,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025")
            return {
              ok: false as const,
              error: `TagGroup does not exist`,
            };
        }
        return {
          ok: false as const,
          error: `Unknown Error: could not move tagGroup to parent`,
        };
      }
    }),

  addTags: adminProcedure
    .input(
      z.object({
        tagGroupId: z.uuid(),
        tags: z.array(z.uuid()).nonempty(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Verify all tags exist
        const existingTags = await prisma.tag.findMany({
          where: { id: { in: input.tags } },
        });

        if (existingTags.length !== input.tags.length) {
          return {
            ok: false as const,
            error: `One or more tags do not exist`,
          };
        }

        // Collect all ancestor IDs (including current node)
        const ancestorIds: string[] = [];
        // Travser to the tagGroup and then add all nodes to an array
        await traverseToRoot(input.tagGroupId, (node: TagGroup) => {
          ancestorIds.push(node.id);
        });

        // Update all in a transaction
        await prisma.$transaction(
          ancestorIds.map((id) =>
            prisma.tagGroup.update({
              where: { id },
              data: {
                tags: {
                  connect: input.tags.map((tagId) => ({ id: tagId })),
                },
              },
            }),
          ),
        );

        return {
          ok: true as const,
          tagGroupId: input.tagGroupId,
          connectedTags: input.tags,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025") {
            return {
              ok: false as const,
              error: `TagGroup does not exist`,
            };
          }
        }
        return {
          ok: false as const,
          error: `Failed to add tags to TagGroup`,
        };
      }
    }),
});
