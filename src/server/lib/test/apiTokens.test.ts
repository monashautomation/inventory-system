import { describe, it, expect } from "vitest";
import prismaMock from "@/server/lib/__mocks__/prisma";
import {
  TOKEN_PREFIX,
  hashToken,
  generateToken,
  looksLikeApiToken,
  verifyApiToken,
  bearerFromHeaders,
} from "@/server/lib/apiTokens";

describe("apiTokens lib", () => {
  describe("hashToken", () => {
    it("is deterministic sha256 hex", () => {
      const a = hashToken("mai_deadbeef");
      const b = hashToken("mai_deadbeef");
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("differs for different secrets", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });

  describe("generateToken", () => {
    it("produces mai_ + 64 hex chars", () => {
      const { secret } = generateToken();
      expect(secret).toMatch(new RegExp(`^${TOKEN_PREFIX}[0-9a-f]{64}$`));
    });

    it("stores hash = sha256(secret) and a short preview", () => {
      const { secret, hash, preview } = generateToken();
      expect(hash).toBe(hashToken(secret));
      expect(preview.length).toBeLessThan(secret.length);
      expect(preview).toContain(TOKEN_PREFIX);
      expect(preview).toContain("…");
    });

    it("secrets are unique across calls", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) seen.add(generateToken().secret);
      expect(seen.size).toBe(50);
    });
  });

  describe("looksLikeApiToken", () => {
    it("accepts the right shape only", () => {
      expect(looksLikeApiToken(generateToken().secret)).toBe(true);
      expect(looksLikeApiToken("nope")).toBe(false);
      expect(looksLikeApiToken(`${TOKEN_PREFIX}short`)).toBe(false);
      expect(looksLikeApiToken("".padStart(64, "x"))).toBe(false);
      expect(looksLikeApiToken(null)).toBe(false);
      expect(looksLikeApiToken(undefined)).toBe(false);
    });
  });

  describe("bearerFromHeaders", () => {
    it("extracts the bearer value", () => {
      const h = new Headers({ authorization: "Bearer abc123" });
      expect(bearerFromHeaders(h)).toBe("abc123");
    });

    it("is case-insensitive on the scheme and trims", () => {
      const h = new Headers({ authorization: "bearer   tok  " });
      expect(bearerFromHeaders(h)).toBe("tok");
    });

    it("returns null when absent or malformed", () => {
      expect(bearerFromHeaders(new Headers())).toBeNull();
      expect(
        bearerFromHeaders(new Headers({ authorization: "Basic xyz" })),
      ).toBeNull();
    });
  });

  describe("verifyApiToken", () => {
    const secret = generateToken().secret;
    const hash = hashToken(secret);
    const validRow = {
      id: "tok-1",
      name: "cli",
      readOnly: true,
      ownerId: "user-1",
      tokenHash: hash,
      revokedAt: null,
      expiresAt: null,
      owner: {
        id: "user-1",
        name: "U",
        email: "u@x",
        role: "user",
        banned: false,
      },
    };

    it("returns null for non-token-shaped strings without hitting the db", async () => {
      expect(await verifyApiToken("not-a-token")).toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.apiToken.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for unknown tokens", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue(null as never);
      expect(await verifyApiToken(secret)).toBeNull();
    });

    it("rejects revoked tokens", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        ...validRow,
        revokedAt: new Date(),
      } as never);
      expect(await verifyApiToken(secret)).toBeNull();
    });

    it("rejects expired tokens", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        ...validRow,
        expiresAt: new Date(Date.now() - 1000),
      } as never);
      expect(await verifyApiToken(secret)).toBeNull();
    });

    it("rejects tokens owned by banned users", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue({
        ...validRow,
        owner: { ...validRow.owner, banned: true },
      } as never);
      expect(await verifyApiToken(secret)).toBeNull();
    });

    it("accepts a valid token and returns owner + readOnly flag", async () => {
      prismaMock.apiToken.findUnique.mockResolvedValue(validRow as never);
      prismaMock.apiToken.update.mockResolvedValue(null as never);
      const v = await verifyApiToken(secret);
      expect(v).not.toBeNull();
      expect(v!.id).toBe("tok-1");
      expect(v!.readOnly).toBe(true);
      expect(v!.owner.role).toBe("user");
    });
  });
});
