import crypto from "crypto";
import { prisma } from "./prisma";
import { logger } from "./logger";

export const TOKEN_PREFIX = "mai_";

export interface GeneratedToken {
  /** Plaintext secret — show once, never store. */
  secret: string;
  /** SHA-256 hex of the secret — what gets stored. */
  hash: string;
  /** Short display form, e.g. mai_a1b2…9f0e */
  preview: string;
}

/** Hash a token secret for storage/lookup. */
export function hashToken(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Generate a new API token secret. Format: mai_<64 hex chars>. */
export function generateToken(): GeneratedToken {
  const secret = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  const hash = hashToken(secret);
  const preview = `${TOKEN_PREFIX}${secret.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 4)}…${secret.slice(-4)}`;
  return { secret, hash, preview };
}

/** True if the string looks like an API token (used to skip cheap lookups). */
export function looksLikeApiToken(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(TOKEN_PREFIX) &&
    value.length === TOKEN_PREFIX.length + 64
  );
}

export interface VerifiedToken {
  id: string;
  name: string;
  readOnly: boolean;
  ownerId: string;
}

/**
 * Verify a bearer token against the ApiToken table.
 * Returns the token + its owner (with role) when valid, null otherwise.
 * Expired and revoked tokens fail closed.
 */
export async function verifyApiToken(secret: string): Promise<
  | (VerifiedToken & {
      owner: { id: string; name: string; email: string; role: string };
    })
  | null
> {
  if (!looksLikeApiToken(secret)) return null;

  const hash = hashToken(secret);
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    include: {
      owner: {
        select: { id: true, name: true, email: true, role: true, banned: true },
      },
    },
  });

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  if (row.owner.banned) return null;

  // Fire-and-forget usage stamp; never block or fail the request over it.
  prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch((err) =>
      logger.warn({ err, tokenId: row.id }, "failed to stamp token lastUsedAt"),
    );

  return {
    id: row.id,
    name: row.name,
    readOnly: row.readOnly,
    ownerId: row.ownerId,
    owner: row.owner,
  };
}

/** Extract a bearer token from request headers, if present. */
export function bearerFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() ?? null;
}
