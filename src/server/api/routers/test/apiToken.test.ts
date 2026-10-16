import { describe, it, expect, beforeEach } from "vitest";
import { createCallerFactory } from "@/server/trpc";
import { apiTokenRouter } from "../apiToken";
import prismaMock from "@/server/lib/__mocks__/prisma";
import {
  hashToken,
  TOKEN_PREFIX,
  type VerifiedToken,
} from "@/server/lib/apiTokens";

// prisma is globally mocked in vitest.setup.ts

const sessionUser = (
  overrides: Partial<{ id: string; role: string }> = {},
) => ({
  id: overrides.id ?? "user-1",
  name: "Test User",
  email: "test@example.com",
  role: overrides.role ?? "user",
});

const baseCtx = (
  user: ReturnType<typeof sessionUser>,
  apiToken:
    | (VerifiedToken & {
        owner: { id: string; name: string; email: string; role: string };
      })
    | null = null,
) => ({
  prisma: prismaMock as never,
  user,
  apiToken,
  req: new Request("http://localhost"),
  res: {} as Response,
});

const caller = createCallerFactory(apiTokenRouter);

describe("apiToken router", () => {
  beforeEach(() => {
    // $transaction should invoke the callback with the mock as tx
    prismaMock.$transaction.mockImplementation(
      (cb: any) => cb(prismaMock) as never,
    );
    prismaMock.auditLog.create.mockResolvedValue(null as never);
  });

  describe("create", () => {
    it("returns the plaintext exactly once and stores only the hash", async () => {
      let stored: any = null;
      prismaMock.apiToken.create.mockImplementation(((args: any) => {
        stored = args.data;
        return {
          id: "tok-1",
          name: args.data.name,
          preview: args.data.preview,
          readOnly: args.data.readOnly,
          ownerId: args.data.ownerId,
          createdAt: new Date(),
          expiresAt: args.data.expiresAt ?? null,
          lastUsedAt: null,
          revokedAt: null,
        };
      }) as never);

      const c = caller(baseCtx(sessionUser()));
      const res = await c.create({ name: "laptop CLI" });

      // plaintext returned, correct format
      expect(res.token).toMatch(new RegExp(`^${TOKEN_PREFIX}[0-9a-f]{64}$`));
      // hash stored is sha256 of the returned secret
      expect(stored.tokenHash).toBe(hashToken(res.token));
      // plaintext never persisted
      expect(stored.token).toBeUndefined();
      // preview is short and derived from the secret
      expect(res.preview).toContain(TOKEN_PREFIX);
      expect(res.preview.length).toBeLessThan(res.token.length);
      // response carries no hash
      expect((res as any).tokenHash).toBeUndefined();
    });

    it("defaults to read-only for non-admins even if they ask otherwise", async () => {
      let stored: any = null;
      prismaMock.apiToken.create.mockImplementation(((args: any) => {
        stored = args.data;
        return {
          id: "tok-2",
          name: args.data.name,
          preview: args.data.preview,
          readOnly: args.data.readOnly,
          ownerId: args.data.ownerId,
          createdAt: new Date(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
        };
      }) as never);

      const c = caller(baseCtx(sessionUser({ role: "user" })));
      const res = await c.create({ name: "sneaky", readOnly: false as any });
      expect(stored.readOnly).toBe(true);
      expect(res.readOnly).toBe(true);
    });

    it("lets admins create read-write tokens via a browser session", async () => {
      let stored: any = null;
      prismaMock.apiToken.create.mockImplementation(((args: any) => {
        stored = args.data;
        return {
          id: "tok-3",
          name: args.data.name,
          preview: args.data.preview,
          readOnly: args.data.readOnly,
          ownerId: args.data.ownerId,
          createdAt: new Date(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
        };
      }) as never);

      const c = caller(baseCtx(sessionUser({ role: "admin" })));
      const res = await c.create({ name: "ops", readOnly: false });
      expect(stored.readOnly).toBe(false);
      expect(res.readOnly).toBe(false);
    });

    it("forces tokens minted through an API token to be read-only", async () => {
      let stored: any = null;
      prismaMock.apiToken.create.mockImplementation(((args: any) => {
        stored = args.data;
        return {
          id: "tok-4",
          name: args.data.name,
          preview: args.data.preview,
          readOnly: args.data.readOnly,
          ownerId: args.data.ownerId,
          createdAt: new Date(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
        };
      }) as never);

      // admin user, but authenticated *via* a read-only API token, asking
      // for a read-write token — must be downgraded, no scope escalation
      const c = caller(
        baseCtx(sessionUser({ role: "admin" }), {
          id: "tok-parent",
          name: "parent",
          readOnly: true,
          ownerId: "user-1",
          owner: {
            id: "user-1",
            name: "Test User",
            email: "test@example.com",
            role: "admin",
          },
        }),
      );
      const res = await c.create({ name: "escalate", readOnly: false });
      expect(stored.readOnly).toBe(true);
      expect(res.readOnly).toBe(true);
    });

    it("writes a TOKEN_CREATED audit entry", async () => {
      prismaMock.apiToken.create.mockResolvedValue({
        id: "tok-5",
        name: "audit me",
        preview: "mai_abcd…1234",
        readOnly: true,
        ownerId: "user-1",
        createdAt: new Date(),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      } as never);

      const c = caller(baseCtx(sessionUser()));
      await c.create({ name: "audit me" });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "TOKEN_CREATED",
            actorId: "user-1",
            entityType: "ApiToken",
            entityId: "tok-5",
          }),
        }),
      );
    });

    it("sets expiresAt when expiresInDays is given", async () => {
      let stored: any = null;
      prismaMock.apiToken.create.mockImplementation(((args: any) => {
        stored = args.data;
        return {
          id: "tok-6",
          name: args.data.name,
          preview: args.data.preview,
          readOnly: true,
          ownerId: args.data.ownerId,
          createdAt: new Date(),
          expiresAt: args.data.expiresAt ?? null,
          lastUsedAt: null,
          revokedAt: null,
        };
      }) as never);

      const c = caller(baseCtx(sessionUser()));
      const before = Date.now();
      const res = await c.create({ name: "temp", expiresInDays: 30 });
      const expected = before + 30 * 24 * 60 * 60 * 1000;
      expect(res.expiresAt!.getTime()).toBeGreaterThanOrEqual(expected - 5000);
      expect(res.expiresAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 30 * 24 * 60 * 60 * 1000 + 5000,
      );
      expect(stored.expiresAt).toBeInstanceOf(Date);
    });

    it("rejects empty names and out-of-range expiry", async () => {
      const c = caller(baseCtx(sessionUser()));
      await expect(c.create({ name: "" })).rejects.toThrow();
      await expect(c.create({ name: "x", expiresInDays: 0 })).rejects.toThrow();
      await expect(
        c.create({ name: "x", expiresInDays: 366 }),
      ).rejects.toThrow();
    });

    it("requires authentication", async () => {
      const c = caller(baseCtx(undefined as never));
      await expect(c.create({ name: "anon" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  describe("listMine", () => {
    it("only returns the caller's own tokens and never the hash", async () => {
      prismaMock.apiToken.findMany.mockResolvedValue([] as never);
      const c = caller(baseCtx(sessionUser({ id: "user-42" })));
      await c.listMine();
      const args = prismaMock.apiToken.findMany.mock.calls[0][0] as any;
      expect(args.where.ownerId).toBe("user-42");
      expect(args.select.tokenHash).toBeUndefined();
    });
  });

  describe("listAll", () => {
    it("is admin-only", async () => {
      const userCaller = caller(baseCtx(sessionUser({ role: "user" })));
      await expect(userCaller.listAll()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      prismaMock.apiToken.findMany.mockResolvedValue([] as never);
      const adminCaller = caller(baseCtx(sessionUser({ role: "admin" })));
      await adminCaller.listAll();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.apiToken.findMany).toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("revokes your own token and audits it", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        id: "tok-7",
        name: "old",
        ownerId: "user-1",
        revokedAt: null,
      } as never);
      prismaMock.apiToken.update.mockResolvedValue({
        id: "tok-7",
        name: "old",
        preview: "mai_abcd…1234",
        readOnly: true,
        ownerId: "user-1",
        createdAt: new Date(),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: new Date(),
      } as never);

      const c = caller(baseCtx(sessionUser()));
      const res = await c.revoke({
        id: "00000000-0000-4000-8000-000000000007",
      });
      expect(res.ok).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.apiToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TOKEN_REVOKED" }),
        }),
      );
    });

    it("cannot revoke someone else's token unless admin", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        id: "tok-8",
        name: "victim",
        ownerId: "someone-else",
        revokedAt: null,
      } as never);
      const c = caller(baseCtx(sessionUser()));
      const res = await c.revoke({
        id: "00000000-0000-4000-8000-000000000008",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Not your token");
    });

    it("admins can revoke any token", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        id: "tok-9",
        name: "renegade",
        ownerId: "someone-else",
        revokedAt: null,
      } as never);
      prismaMock.apiToken.update.mockResolvedValue({
        id: "tok-9",
        name: "renegade",
        preview: "mai_abcd…1234",
        readOnly: true,
        ownerId: "someone-else",
        createdAt: new Date(),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: new Date(),
      } as never);
      const c = caller(baseCtx(sessionUser({ role: "admin" })));
      const res = await c.revoke({
        id: "00000000-0000-4000-8000-000000000009",
      });
      expect(res.ok).toBe(true);
    });

    it("reports missing and already-revoked tokens", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue(null as never);
      const c = caller(baseCtx(sessionUser()));
      const missing = await c.revoke({
        id: "00000000-0000-4000-8000-00000000000a",
      });
      expect(missing.ok).toBe(false);

      prismaMock.apiToken.findUnique.mockResolvedValue({
        id: "tok-10",
        name: "dead",
        ownerId: "user-1",
        revokedAt: new Date(),
      } as never);
      const dead = await c.revoke({
        id: "00000000-0000-4000-8000-00000000000b",
      });
      expect(dead.ok).toBe(false);
      if (!dead.ok) expect(dead.error).toBe("Already revoked");
    });
  });
});
