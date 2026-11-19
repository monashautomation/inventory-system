import { describe, it, expect } from "vitest";
import {
  describeHmsErrors,
  hmsAttentionLevel,
  isOperationalHmsError,
  lookupHmsDescription,
} from "../hmsErrors";

describe("hmsErrors", () => {
  it("treats filament run-out as operational", () => {
    expect(
      isOperationalHmsError(
        'The filament ran out. Please load new filament and select "Resume" to resume the print job.',
      ),
    ).toBe(true);
  });

  it("treats hardware faults as errors", () => {
    expect(isOperationalHmsError("The nozzle is clogged.")).toBe(false);
    expect(
      isOperationalHmsError("Z axis homing failed; the task has been stopped."),
    ).toBe(false);
  });

  it("builds a Bambu wiki link and flags unknown codes as errors", () => {
    const [e] = describeHmsErrors([{ code: "00010005", attr: 0x03004000 }]);
    expect(e.wikiUrl).toBe("https://e.bambulab.com/?e=0300400000010005");
    expect(e.operational).toBe(false);
    expect(hmsAttentionLevel([e])).toBe("error");
    expect(hmsAttentionLevel([{ operational: true }])).toBe("warning");
    expect(hmsAttentionLevel([])).toBe("error");
  });

  it("looks up real HMS codes by attr + code, not as unknown errors", () => {
    // 0300_1200_0002_0001, shown as "0x20001" in the UI.
    const [e] = describeHmsErrors([{ code: "0x20001", attr: 0x03001200 }]);
    expect(e.description).toBe("The front cover of the toolhead fell off.");
    expect(e.description).not.toMatch(/unknown/i);
    expect(e.wikiUrl).toBe("https://e.bambulab.com/?e=0300120000020001");
  });

  it("still resolves job-level print errors such as 0x4003", () => {
    const [e] = describeHmsErrors([{ code: "0x4003", attr: 0x05000000 }]);
    expect(e.description).toMatch(/unable to parse the file/i);
    expect(lookupHmsDescription(0x05000000, 0x4003)).toMatch(/parse/i);
  });

  it("does not match an HMS code to an unrelated print error", () => {
    // Same module bytes and low 16 bits as the known print error 03008005
    // ("front cover fell off"), but a different, unlisted HMS code.
    expect(lookupHmsDescription(0x03000000, 0x00018005)).toBeUndefined();
    const [e] = describeHmsErrors([{ code: "0x18005", attr: 0x03000000 }]);
    expect(e.description).toBe("Unknown error (0x18005)");
  });
});
