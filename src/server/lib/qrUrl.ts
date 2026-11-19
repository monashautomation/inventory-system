import { logger as rootLogger } from "@/server/lib/logger";

const logger = rootLogger.child({ module: "qrUrl" });

/**
 * Validates and normalises a public base URL: must be http(s), and is returned
 * as `origin + path` with no query, hash or trailing slash. Returns null when
 * the value is empty or not a usable URL.
 */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

let warnedInvalid = false;

/**
 * The public base URL encoded into item QR codes.
 *
 * Order of precedence: `QR_BASE_URL` (set this to the stable address printed
 * labels should always point at), then `FRONTEND_URL`, then localhost.
 */
export function getQrBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = normalizeBaseUrl(env.QR_BASE_URL);
  if (configured) return configured;

  if (env.QR_BASE_URL?.trim() && !warnedInvalid) {
    warnedInvalid = true;
    logger.warn(
      { QR_BASE_URL: env.QR_BASE_URL },
      "QR_BASE_URL is not a valid http(s) URL; falling back to FRONTEND_URL",
    );
  }

  return (
    normalizeBaseUrl(env.FRONTEND_URL) ?? `http://localhost:${env.PORT ?? 3000}`
  );
}

/** The URL a QR code for an item should encode. */
export function buildQrUrl(baseUrl: string, itemId: string): string {
  return `${baseUrl}/qr/${itemId}`;
}
