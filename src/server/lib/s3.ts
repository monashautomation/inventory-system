import { S3Client, type S3File } from "bun";

// ─── Client singleton ─────────────────────────────────────────────────────────

const BUCKET = process.env.S3_BUCKET ?? "gcode-vault";
const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";

/**
 * Bun native S3 client configured for MinIO.
 *
 * MinIO uses path-style URLs: http://localhost:9000/<bucket>/<key>
 * Bun handles this automatically when `endpoint` is provided.
 *
 * Env vars Bun reads automatically (S3_* preferred, AWS_* as fallback):
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET
 */
export const s3 = new S3Client({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  endpoint: ENDPOINT,
  bucket: BUCKET,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a consistent S3 key for print job files.
 *
 * Format: prints/{userId}/{timestamp}_{sha256Prefix}_{sanitizedFilename}
 */
export function buildPrintJobS3Key(
  userId: string,
  timestamp: number,
  sha256Prefix: string,
  sanitizedFilename: string,
): string {
  return `prints/${userId}/${timestamp}_${sha256Prefix}_${sanitizedFilename}`;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a Buffer / Uint8Array to MinIO.
 *
 * Bun automatically uses multipart upload for files > 5 MB.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType = "application/octet-stream",
): Promise<{ key: string; bucket: string }> {
  const file: S3File = s3.file(key);
  await file.write(body, { type: contentType });
  return { key, bucket: BUCKET };
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download an object as a Uint8Array buffer.
 */
export async function downloadFile(key: string): Promise<Uint8Array> {
  const file: S3File = s3.file(key);
  return file.bytes();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  await s3.file(key).delete();
}

// ─── Presigned URLs ──────────────────────────────────────────────────────────

/**
 * Generate a presigned GET URL for direct browser download.
 * Synchronous — uses local HMAC signing, no network request.
 */
export function presignDownload(key: string, expiresIn = 3600): string {
  return s3.presign(key, { method: "GET", expiresIn });
}

// ─── Existence check ─────────────────────────────────────────────────────────

export async function fileExists(key: string): Promise<boolean> {
  return s3.file(key).exists();
}
