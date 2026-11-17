import { validate as isValidUUID } from "uuid";

/**
 * Pulls an item id out of whatever a scanner returned: a full label URL
 * (`<base>/qr/<id>`), a bare path (`/qr/<id>`), or just the id. Returns null
 * when no valid item id is found. Independent of the site's hostname, so
 * labels keep working in the in-app scanner if the domain changes.
 */
export function parseQrItemId(scanned: string): string | null {
  const segments = scanned.trim().split(/[/?#]/).filter(Boolean);
  const qrIndex = segments.indexOf("qr");
  const candidate =
    qrIndex !== -1 ? segments[qrIndex + 1] : segments[segments.length - 1];
  return candidate && isValidUUID(candidate) ? candidate : null;
}
