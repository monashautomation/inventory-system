/**
 * Bambu Lab HMS (Hardware Management System) error code lookup.
 * Codes normalized to 8-digit lowercase hex (no 0x prefix).
 * Source: wiki.bambulab.com/en/x1/troubleshooting/hms
 */
const HMS_ERROR_MAP: Record<string, string> = {
  // Nozzle (module 0x0C)
  "0c000001": "Nozzle temperature sensor anomaly",
  "0c000002": "Nozzle heater anomaly",
  "0c001800": "Nozzle potentially clogged",
  "0c004000": "Nozzle temperature too high",
  "0c008000": "Nozzle temperature too low",

  // Heatbed (module 0x03)
  "03000001": "Heatbed temperature sensor anomaly",
  "03000002": "Heatbed heater anomaly",
  "03004000": "Heatbed temperature control error; check build plate attachment",
  "0300c000": "Heatbed temperature too high",

  // AMS (module 0x05)
  "05000800": "AMS heat abnormal",
  "05001800": "AMS humidity too high; dry filament before printing",
  "05004000": "AMS slot filament error",
  "05008000": "AMS communication error",
  "050c0001": "AMS motor overload",
  "050c0002": "AMS motor speed anomaly",
  "050c0003": "AMS motor blocked",

  // Extruder / filament (module 0x07)
  "07000800": "Extruder motor anomaly",
  "07008001": "Filament sensor error",
  "07008002": "Filament runout",
  "0700c000": "Filament jam",
  "07004000": "Extruder clog",

  // First layer inspection (module 0x0F)
  "0f000001": "First layer inspection: abnormal — check bed leveling and adhesion",
  "0f000002": "First layer inspection: flow anomaly",
  "0f000003": "First layer inspection: surface error",

  // MC board (module 0x12)
  "12000001": "MC board temperature too high",
  "12000002": "MC board voltage anomaly",

  // Motion / XY (module 0x02)
  "00020002": "Motion system error; check for obstructions on axes",
  "00020001": "X-axis motor anomaly",
  "02000001": "X-axis motor anomaly",
  "02000002": "Y-axis motor anomaly",
  "02000003": "Z-axis motor anomaly",
  "02004000": "Axis position error",

  // System (module 0x00)
  "00008006": "Filament tangle or jam detected",
  "00000001": "System error",
  "00008001": "Filament sensor triggered",
  "00008002": "Filament runout (system)",
};

/** Normalize a hex error code string to 8-digit lowercase (no prefix). */
function normalizeCode(code: string): string {
  const hex = code.toLowerCase().replace(/^0x/, "");
  return hex.padStart(8, "0");
}

export interface HmsErrorInfo {
  code: string;
  description: string;
}

export function describeHmsErrors(
  errors: { code: string }[],
): HmsErrorInfo[] {
  return errors.map((e) => ({
    code: e.code,
    description: HMS_ERROR_MAP[normalizeCode(e.code)] ?? "Unknown error",
  }));
}

export function hmsErrorSummary(errors: { code: string }[]): string {
  if (errors.length === 0) return "";
  const count = errors.length;
  return `Printer error${count > 1 ? `s (${count})` : ""}`;
}
