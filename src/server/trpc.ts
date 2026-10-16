import crypto from "crypto";
import superjson from "superjson";
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { Context } from "hono";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { prisma } from "./lib/prisma";
import { auth } from "./auth";
import { bearerFromHeaders, verifyApiToken } from "./lib/apiTokens";
import type { McpMeta } from "trpc-to-mcp";
import { logger } from "./lib/logger";

// Create the tRPC context, compatible with Hono and tRPC
export const createContext = async (
  opts: FetchCreateContextFnOptions,
  c: Context,
) => {
  // Use Hono's Context to access headers
  const headers = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  const authSession = await auth.api.getSession({
    headers: headers,
  });

  // Fall back to a bearer API token (created via Settings → API Tokens or
  // `maims tokens create`). Read-only tokens are enforced in the procedures.
  let apiToken: Awaited<ReturnType<typeof verifyApiToken>> = null;
  if (!authSession?.user?.id) {
    const bearer = bearerFromHeaders(headers);
    if (bearer) {
      try {
        apiToken = await verifyApiToken(bearer);
      } catch (err) {
        logger.warn({ err }, "API token verification failed");
      }
    }
  }

  const user =
    authSession?.user ??
    (apiToken
      ? {
          id: apiToken.owner.id,
          name: apiToken.owner.name,
          email: apiToken.owner.email,
          role: apiToken.owner.role,
        }
      : undefined);

  const source = headers.get("x-trpc-source");
  const username = user?.name ?? user?.email ?? source ?? "anonymous";
  logger.debug({ username }, "tRPC request");

  return {
    req: opts.req, // Use tRPC's req for compatibility
    res: c.res, // Use Hono's response object
    prisma,
    user,
    apiToken,
  };
};

export type ContextType = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC with the context
export const t = initTRPC
  .meta<McpMeta>()
  .context<ContextType>()
  .create({
    transformer: superjson,
    errorFormatter: ({ shape, error }) => ({
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }),
  });

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
export const publicProcedure = t.procedure;

// Kiosk procedure: validates x-kiosk-token against KIOSK_SECRET env var.
// In development/test the check is skipped for convenience.
// In production, KIOSK_SECRET must be set - missing secret fails closed.
export const kioskProcedure = t.procedure.use(({ ctx, next }) => {
  const secret = process.env.KIOSK_SECRET;
  const isDev =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (!secret) {
    if (!isDev) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
  } else {
    const token = ctx.req.headers.get("x-kiosk-token") ?? "";
    const secretBuf = Buffer.from(secret);
    const tokenBuf = Buffer.from(
      token.padEnd(secret.length, "\0").slice(0, secret.length),
    );
    const lengthMatch = token.length === secret.length;
    if (!lengthMatch || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
  }
  return next({ ctx });
});

// Protected procedure for authenticated users
export const userProcedure = t.procedure.use(({ ctx, type, next }) => {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Read-only API tokens (the `maims` CLI default) may call queries but
  // never mutations — enforced server-side, not just client-side.
  // Token housekeeping (create/revoke) uses tokenHousekeepingProcedure
  // instead; tokens minted through a token are forced read-only in the
  // router, so that exemption can never escalate scope.
  if (ctx.apiToken?.readOnly && type === "mutation") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This API token is read-only.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Authenticated, but exempt from the read-only-token mutation guard.
 * ONLY for API-token housekeeping (apiToken.create / apiToken.revoke) so a
 * CLI token can be rotated without a browser session. The apiToken router
 * forces any token created through an API token to be read-only, so this
 * cannot be used to escalate scope.
 */
export const tokenHousekeepingProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Protected procedure for admin users
export const adminProcedure = t.procedure.use(({ ctx, type, next }) => {
  if (!ctx.user?.id || !ctx.user?.role || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.apiToken?.readOnly && type === "mutation") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This API token is read-only.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
