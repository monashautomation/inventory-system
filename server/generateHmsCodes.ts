/**
 * Regenerates src/server/lib/hmsDeviceCodes.json from BambuStudio's published
 * HMS data. Run with `bun run generate:hms` when new printer models or
 * firmware add error codes.
 *
 * Bambu publishes two separate tables per printer model:
 *  - device_hms:   16-hex keys (attr + code), reported in a printer's HMS list
 *  - device_error: 8-hex keys, job-level "print error" codes
 * The 8-hex table is already in src/server/lib/hmsErrors.ts. This script
 * writes the 16-hex table. The same code can read slightly differently per
 * model, so the most common wording across models is kept.
 */
const MODELS = ["093", "094", "20P", "22E", "239", "26A", "31B"];
const BASE =
  "https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/hms";

interface HmsFile {
  data: { device_hms: { en: { ecode: string; intro: string }[] } };
}

const counts = new Map<string, Map<string, number>>();
for (const model of MODELS) {
  const res = await fetch(`${BASE}/hms_en_${model}.json`);
  if (!res.ok) throw new Error(`hms_en_${model}.json: HTTP ${res.status}`);
  const file = (await res.json()) as HmsFile;
  for (const { ecode, intro } of file.data.device_hms.en) {
    const key = ecode.toLowerCase();
    const texts = counts.get(key) ?? new Map<string, number>();
    texts.set(intro, (texts.get(intro) ?? 0) + 1);
    counts.set(key, texts);
  }
}

const out: Record<string, string> = {};
for (const key of [...counts.keys()].sort()) {
  const texts = [...counts.get(key)!.entries()];
  // Most common wording; first seen wins a tie.
  texts.sort((a, b) => b[1] - a[1]);
  out[key] = texts[0][0];
}

const path = new URL("../src/server/lib/hmsDeviceCodes.json", import.meta.url);
await Bun.write(path, JSON.stringify(out, null, 0) + "\n");
console.log(`Wrote ${Object.keys(out).length} HMS codes to ${path.pathname}`);
