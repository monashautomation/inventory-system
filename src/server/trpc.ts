import superjson from "superjson";
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { Context } from "hono";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { prisma } from "./lib/prisma";
import { auth } from "./auth";
import { type McpMeta } from "trpc-to-mcp";

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

  const source = headers.get("x-trpc-source") ?? "unknown";
  console.log(">>> tRPC Request from", source);

  return {
    req: opts.req, // Use tRPC's req for compatibility
    res: c.res, // Use Hono's response object
    prisma,
    user: authSession?.user,
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

// Protected procedure for authenticated users
export const userProcedure = t.procedure.use(({ ctx, next }) => {
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
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user?.id || !ctx.user?.role || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
