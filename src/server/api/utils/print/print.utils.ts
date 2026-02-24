import { createHash } from "node:crypto";

const MAX_GCODE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_GCODE_EXTENSIONS = [".gcode", ".gco", ".gc", ".bgcode"] as const;

export const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

export const hasAllowedGcodeExtension = (name: string) => {
  const lower = name.toLowerCase();
  return ALLOWED_GCODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export const hashBufferSha256 = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export const validateGcodePayload = (fileName: string, fileBuffer: Buffer) => {
  if (!fileName.trim()) {
    throw new Error("File name is required.");
  }

  if (!hasAllowedGcodeExtension(fileName)) {
    throw new Error("Only .gcode, .gco, .gc, and .bgcode files are supported.");
  }

  if (fileBuffer.length === 0) {
    throw new Error("G-code file cannot be empty.");
  }

  if (fileBuffer.length > MAX_GCODE_SIZE_BYTES) {
    throw new Error("G-code file is too large. Max size is 50MB.");
  }
};
