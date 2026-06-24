import { router, adminProcedure, userProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { z } from "zod";
import { userInput, userUpdateInput } from "@/server/schema/user.schema";
import {
  syncAllMembers,
  syncOneMember,
  getMemberSyncStatus,
} from "@/server/lib/member-sync";
import { getBaseUrl } from "@/lib/utils";

export const userRouter = router({
  create: adminProcedure.input(userInput).mutation(async ({ input }) => {
    return prisma.user.create({
      data: input,
    });
  }),

  get: adminProcedure
    .meta({
      mcp: {
        name: "user_get",
        enabled: true,
        description:
          "Get a user by their ID, including their group and transaction records",
      },
    })
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }) => {
      return prisma.user.findUnique({
        where: { id: input.id },
        include: {
          group: true,
          ItemRecords: true,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({ id: z.uuid(), data: userUpdateInput }))
    .mutation(async ({ input }) => {
      return prisma.user.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.user.delete({
        where: { id: input.id },
      });
    }),

  list: adminProcedure
    .meta({
      mcp: {
        name: "user_list",
        enabled: true,
        description: "List all users with their groups and transaction records",
      },
    })
    .query(async () => {
      return prisma.user.findMany({
        include: {
          group: true,
          ItemRecords: true,
        },
      });
    }),

  members: adminProcedure.query(async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        banned: true,
        banReason: true,
        banExpires: true,
        studentNumber: true,
        group: { select: { id: true, name: true } },
        sessions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const base = getBaseUrl();
    return users.map((u) => ({
      ...u,
      image: u.image?.startsWith("avatars/")
        ? `${base}/api/users/${u.id}/avatar`
        : u.image,
    }));
  }),

  ban: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        reason: z.string().optional(),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.user.update({
        where: { id: input.id },
        data: {
          banned: true,
          banReason: input.reason ?? null,
          banExpires: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
    }),

  unban: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input }) => {
      return prisma.user.update({
        where: { id: input.id },
        data: { banned: false, banReason: null, banExpires: null },
      });
    }),

  setRole: adminProcedure
    .input(z.object({ id: z.uuid(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new Error("Cannot change your own role");
      }
      return prisma.user.update({
        where: { id: input.id },
        data: { role: input.role },
      });
    }),

  memberSyncStatus: adminProcedure.query(() => {
    return getMemberSyncStatus();
  }),

  syncAllMembers: adminProcedure.mutation(async () => {
    return syncAllMembers();
  }),

  syncOneMember: adminProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ input }) => {
      return syncOneMember(input.userId);
    }),

  getSelf: userProcedure.query(async ({ ctx }) => {
    return prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { lastSeenVersion: true },
    });
  }),

  acknowledgeVersion: userProcedure
    .input(z.object({ version: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.user.update({
        where: { id: ctx.user.id },
        data: { lastSeenVersion: input.version },
      });
    }),
});
