import { z } from "zod";
import {
  router,
  userProcedure,
  adminProcedure,
  tokenHousekeepingProcedure,
} from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { generateToken } from "@/server/lib/apiTokens";
import { writeAuditLog } from "../utils/audit/log";

const createTokenInput = z.object({
  name: z.string().min(1).max(100),
  /**
   * Read-only tokens can call queries but never mutations. Defaults to true.
   * Only admins may create tokens with readOnly: false.
   */
  readOnly: z.boolean().default(true),
  /** Optional lifetime in days (1–365). Omit for no expiry. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const tokenSelect = {
  id: true,
  name: true,
  preview: true,
  readOnly: true,
  ownerId: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

export const apiTokenRouter = router({
  /**
   * Create a new API token. The plaintext is returned exactly once here and
   * is never recoverable afterwards — only its SHA-256 hash is stored.
   * Non-admins are always issued read-only tokens.
   */
  create: tokenHousekeepingProcedure
    .meta({
      mcp: {
        enabled: false,
        description: "Create an API token (plaintext returned once).",
      },
    })
    .input(createTokenInput)
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      // A token may only ever mint a token of equal-or-lesser scope:
      // anything created through an API token is forced read-only.
      const viaToken = Boolean(ctx.apiToken);
      const readOnly = viaToken ? true : isAdmin ? input.readOnly : true;

      const { secret, hash, preview } = generateToken();

      const token = await prisma.$transaction(async (tx) => {
        const created = await tx.apiToken.create({
          data: {
            name: input.name,
            tokenHash: hash,
            preview,
            readOnly,
            ownerId: ctx.user.id,
            expiresAt: input.expiresInDays
              ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
              : undefined,
          },
          select: tokenSelect,
        });

        await writeAuditLog(tx, {
          action: "TOKEN_CREATED",
          actorId: ctx.user.id,
          entityType: "ApiToken",
          entityId: created.id,
          after: {
            name: created.name,
            readOnly: created.readOnly,
            expiresAt: created.expiresAt,
          },
        });

        return created;
      });

      return { ...token, token: secret };
    }),

  /** List the caller's own tokens (never the secret or hash). */
  listMine: userProcedure
    .meta({
      mcp: {
        name: "apiToken_listMine",
        enabled: true,
        description: "List your own API tokens (safe metadata only).",
      },
    })
    .query(async ({ ctx }) => {
      return prisma.apiToken.findMany({
        where: { ownerId: ctx.user.id },
        select: tokenSelect,
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Admin: list every token with owner info. */
  listAll: adminProcedure
    .meta({
      mcp: {
        name: "apiToken_listAll",
        enabled: true,
        description: "List all API tokens with owners (admin only).",
      },
    })
    .query(async () => {
      return prisma.apiToken.findMany({
        select: {
          ...tokenSelect,
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Revoke a token. Owners can revoke their own; admins can revoke any. */
  revoke: tokenHousekeepingProcedure
    .meta({
      mcp: {
        enabled: false,
        description: "Revoke an API token by id.",
      },
    })
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.apiToken.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        return { ok: false as const, error: "Token not found" };
      }
      if (existing.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        return { ok: false as const, error: "Not your token" };
      }
      if (existing.revokedAt) {
        return { ok: false as const, error: "Already revoked" };
      }

      const revoked = await prisma.$transaction(async (tx) => {
        const updated = await tx.apiToken.update({
          where: { id: input.id },
          data: { revokedAt: new Date() },
          select: tokenSelect,
        });
        await writeAuditLog(tx, {
          action: "TOKEN_REVOKED",
          actorId: ctx.user.id,
          entityType: "ApiToken",
          entityId: input.id,
          before: { name: existing.name, revokedAt: existing.revokedAt },
        });
        return updated;
      });

      return { ok: true as const, token: revoked };
    }),
});
