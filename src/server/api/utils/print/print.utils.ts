import { createHash } from "node:crypto";

const MAX_GCODE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_GCODE_EXTENSIONS = [".gcode", ".gco", ".gc", ".bgcode"] as const;

export const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

const toHyphenSlug = (value: string) => value.trim().replace(/[\s_]+/g, "-");

/**
 * Builds the {name}_{project}_{filename} print file name so downstream
 * systems (and humans) can split on "_" to recover uploader/project.
 * Spaces and underscores inside each segment become hyphens first so the
 * top-level underscores stay unambiguous delimiters.
 */
export const buildPrintUploadFilename = (
  userName: string,
  projectName: string,
  originalFilename: string,
) => [userName, projectName, originalFilename].map(toHyphenSlug).join("_");

/**
 * Splits a print upload filename back into its {name}, {project}, and
 * {file} segments. Returns null if the filename doesn't match the
 * name_project_file convention (e.g. a legacy pre-rename upload).
 */
export const parsePrintUploadFilename = (
  filename: string,
): { name: string; project: string; file: string } | null => {
  const parts = filename.split("_");
  if (parts.length < 3) return null;
  const [name, project, ...rest] = parts;
  return { name, project, file: rest.join("_") };
};

const splitFilenameExtension = (
  filename: string,
): { base: string; ext: string } => {
  const compound = /\.gcode\.3mf$/i.exec(filename);
  if (compound) {
    return {
      base: filename.slice(0, filename.length - compound[0].length),
      ext: filename.slice(filename.length - compound[0].length),
    };
  }
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { base: filename, ext: "" };
  return { base: filename.slice(0, idx), ext: filename.slice(idx) };
};

export const appendVersionSuffix = (filename: string, version: number) => {
  const { base, ext } = splitFilenameExtension(filename);
  return `${base}-v${version}${ext}`;
};

/**
 * Appends -v2, -v3, ... before the extension until `exists` reports no
 * collision, so two uploads that would otherwise share the same print
 * name stay distinguishable.
 */
export const resolveUniqueFilename = async (
  baseFilename: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> => {
  if (!(await exists(baseFilename))) return baseFilename;
  let version = 2;
  let candidate = appendVersionSuffix(baseFilename, version);
  while (await exists(candidate)) {
    version += 1;
    candidate = appendVersionSuffix(baseFilename, version);
  }
  return candidate;
};

/**
 * Recovers the uploader's display name from a print filename built by
 * {@link buildPrintUploadFilename}. Returns null for filenames that don't
 * match the name_project_file convention (legacy uploads, or archives
 * created directly in Bambuddy outside this app).
 *
 * Lossy by construction: buildPrintUploadFilename collapses spaces and
 * underscores in the name to hyphens, so a name containing a literal
 * hyphen (e.g. "Anne-Marie") is indistinguishable from a space here and
 * comes back as "Anne Marie". There's no way to recover the original
 * punctuation from the slug alone.
 */
export const printedByNameFromFilename = (
  filename: string | null | undefined,
): string | null => {
  if (!filename) return null;
  const parsed = parsePrintUploadFilename(filename);
  if (!parsed) return null;
  const name = parsed.name.replace(/-/g, " ").trim();
  return name || null;
};

/**
 * Prefers the name encoded in the print's current filename over a
 * DB/queue-derived fallback — the filename reflects who most recently
 * queued/reprinted the file (see buildPrintUploadFilename call sites),
 * which can be more current than stale queue/job attribution. Falls back
 * to `fallback` when the filename doesn't match the naming scheme.
 *
 * When the filename name and fallback name agree, the fallback is kept
 * as-is so its email is preserved. Otherwise the filename wins for
 * display but there's no email to attach, so it's returned empty.
 */
export const resolveStartedBy = (
  fallback: { name: string; email: string } | null,
  fileName: string | null,
): { name: string; email: string } | null => {
  const filenameName = printedByNameFromFilename(fileName);
  if (!filenameName) return fallback;
  if (fallback && fallback.name.toLowerCase() === filenameName.toLowerCase()) {
    return fallback;
  }
  return { name: filenameName, email: "" };
};

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
