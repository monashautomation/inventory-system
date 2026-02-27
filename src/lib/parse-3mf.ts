import { unzipSync } from "fflate";

export interface ThreeMfFilamentInfo {
  /** Number of distinct filaments used by the gcode */
  filamentCount: number;
  /** Plate numbers found in the .3mf (e.g. [1, 2]) */
  plates: number[];
  /** Existing ams_mapping from the .bbl sidecar, if present */
  existingAmsMapping: number[] | null;
  /** Whether use_ams was set in the .bbl sidecar */
  existingUseAms: boolean | null;
}

/**
 * Parse a .3mf file (ZIP archive) to extract filament metadata.
 *
 * Reads:
 * 1. Gcode header comments (`; filament_density:` etc.) to determine filament count
 * 2. `.bbl` JSON sidecar for existing AMS mapping from the slicer
 * 3. Available plates from Metadata/plate_N.gcode entries
 */
export function parse3mf(buffer: ArrayBuffer): ThreeMfFilamentInfo {
  const data = new Uint8Array(buffer);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error("Failed to read .3mf file. The file may be corrupted.");
  }

  // Find all plate gcode files
  const platePattern = /^Metadata\/plate_(\d+)\.gcode$/i;
  const plates: number[] = [];
  for (const name of Object.keys(files)) {
    const match = platePattern.exec(name);
    if (match?.[1]) {
      plates.push(parseInt(match[1], 10));
    }
  }
  plates.sort((a, b) => a - b);

  // Parse filament count from plate 1 gcode (or first available plate)
  const targetPlate = plates.includes(1) ? 1 : plates[0];
  let filamentCount = 1;

  if (targetPlate !== undefined) {
    const gcodeKey = Object.keys(files).find(
      (k) => k.toLowerCase() === `metadata/plate_${targetPlate}.gcode`,
    );

    if (gcodeKey && files[gcodeKey]) {
      filamentCount = extractFilamentCountFromGcode(files[gcodeKey]);
    }
  }

  // Try to read .bbl sidecar for existing AMS mapping
  let existingAmsMapping: number[] | null = null;
  let existingUseAms: boolean | null = null;

  const bblKey = Object.keys(files).find((k) =>
    k.toLowerCase().endsWith(".bbl"),
  );
  if (bblKey && files[bblKey]) {
    try {
      const bblText = new TextDecoder().decode(files[bblKey]);
      const bblJson = JSON.parse(bblText) as Record<string, unknown>;

      // .bbl uses spaces: "ams mapping" and "use ams"
      const mapping = bblJson["ams mapping"] ?? bblJson.ams_mapping;
      if (
        Array.isArray(mapping) &&
        mapping.every((v) => typeof v === "number")
      ) {
        existingAmsMapping = mapping;
      }

      const useAms = bblJson["use ams"] ?? bblJson.use_ams;
      if (typeof useAms === "boolean") {
        existingUseAms = useAms;
      }
    } catch {
      // Ignore malformed .bbl
    }
  }

  return {
    filamentCount,
    plates,
    existingAmsMapping,
    existingUseAms,
  };
}

/**
 * Extract filament count from gcode header comments.
 *
 * Looks for lines like:
 * - `; filament_density: 1.24,1.25,1.25,1.04` (count commas + 1)
 * - `; filament used [g] = 5.23,3.12` (count commas + 1)
 * - `; filament: 1,2,3,4` (count entries)
 *
 * Only reads the first ~200 lines (header section) for performance.
 */
function extractFilamentCountFromGcode(gcodeData: Uint8Array): number {
  // Only decode the first chunk — filament metadata is always in the header
  const headerBytes = gcodeData.slice(0, 8192);
  const header = new TextDecoder().decode(headerBytes);
  const lines = header.split("\n");

  let maxCount = 1;

  for (const line of lines.slice(0, 200)) {
    const trimmed = line.trim();

    // Stop reading once we hit actual gcode commands (non-comment)
    if (trimmed && !trimmed.startsWith(";") && /^[GMT]/.test(trimmed)) {
      break;
    }

    // ; filament_density: 1.24,1.25
    if (trimmed.startsWith("; filament_density:")) {
      const values = trimmed.split(":")[1]?.trim();
      if (values) {
        const count = values.split(",").filter((v) => v.trim()).length;
        if (count > maxCount) maxCount = count;
      }
    }

    // ; filament used [g] = 5.23,3.12
    if (trimmed.startsWith("; filament used")) {
      const eqPart = trimmed.split("=")[1]?.trim();
      if (eqPart) {
        const count = eqPart.split(",").filter((v) => v.trim()).length;
        if (count > maxCount) maxCount = count;
      }
    }

    // ; filament: 1,2,3,4
    if (
      trimmed.startsWith("; filament:") &&
      !trimmed.startsWith("; filament_")
    ) {
      const values = trimmed.split(":")[1]?.trim();
      if (values) {
        const count = values.split(",").filter((v) => v.trim()).length;
        if (count > maxCount) maxCount = count;
      }
    }
  }

  return maxCount;
}
