// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildPrintUploadFilename,
  hashBufferSha256,
  hasAllowedGcodeExtension,
  printedByNameFromFilename,
  resolveStartedBy,
  sanitizeFilename,
  validateGcodePayload,
} from "../print.utils";

describe("print.utils", () => {
  it("sanitizes file names", () => {
    expect(sanitizeFilename("my part (v1).gcode")).toBe("my_part__v1_.gcode");
  });

  it("checks allowed extensions", () => {
    expect(hasAllowedGcodeExtension("part.gcode")).toBe(true);
    expect(hasAllowedGcodeExtension("part.GCO")).toBe(true);
    expect(hasAllowedGcodeExtension("part.bgcode")).toBe(true);
    expect(hasAllowedGcodeExtension("part.txt")).toBe(false);
  });

  it("hashes content deterministically", () => {
    const a = hashBufferSha256(Buffer.from("G1 X10 Y10"));
    const b = hashBufferSha256(Buffer.from("G1 X10 Y10"));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("rejects empty payload", () => {
    expect(() => validateGcodePayload("part.gcode", Buffer.alloc(0))).toThrow(
      "cannot be empty",
    );
  });

  it("rejects invalid extension", () => {
    expect(() =>
      validateGcodePayload("part.txt", Buffer.from("G1 X10 Y10")),
    ).toThrow("Only .gcode, .gco, .gc, and .bgcode files are supported.");
  });

  describe("printedByNameFromFilename", () => {
    it("recovers a single-word name from a scheme-built filename", () => {
      const filename = buildPrintUploadFilename(
        "Sebastian",
        "Robotics",
        "part.gcode",
      );
      expect(printedByNameFromFilename(filename)).toBe("Sebastian");
    });

    it("recovers a multi-word name, turning hyphens back into spaces", () => {
      const filename = buildPrintUploadFilename(
        "Sebastian Keet",
        "Personal",
        "bracket.3mf",
      );
      expect(printedByNameFromFilename(filename)).toBe("Sebastian Keet");
    });

    it("cannot distinguish a literal hyphen in a name from a space", () => {
      const filename = buildPrintUploadFilename(
        "Anne-Marie",
        "Personal",
        "part.gcode",
      );
      expect(printedByNameFromFilename(filename)).toBe("Anne Marie");
    });

    it("returns null for legacy filenames that don't match the scheme", () => {
      expect(printedByNameFromFilename("part.gcode")).toBeNull();
      expect(printedByNameFromFilename(null)).toBeNull();
      expect(printedByNameFromFilename(undefined)).toBeNull();
    });

    it("handles a filename whose file segment itself contains underscores", () => {
      const filename = buildPrintUploadFilename(
        "Sebastian",
        "Robotics",
        "my_part_v2.gcode",
      );
      expect(printedByNameFromFilename(filename)).toBe("Sebastian");
    });
  });

  describe("resolveStartedBy", () => {
    it("prefers the filename-derived name over a disagreeing fallback", () => {
      const filename = buildPrintUploadFilename(
        "Sebastian",
        "Robotics",
        "part.gcode",
      );
      const fallback = { name: "Old Uploader", email: "old@example.com" };
      expect(resolveStartedBy(fallback, filename)).toEqual({
        name: "Sebastian",
        email: "",
      });
    });

    it("keeps the fallback (with its email) when names agree", () => {
      const filename = buildPrintUploadFilename(
        "Sebastian",
        "Robotics",
        "part.gcode",
      );
      const fallback = { name: "Sebastian", email: "seb@example.com" };
      expect(resolveStartedBy(fallback, filename)).toEqual(fallback);
    });

    it("falls back when the filename doesn't match the naming scheme", () => {
      const fallback = { name: "Old Uploader", email: "old@example.com" };
      expect(resolveStartedBy(fallback, "part.gcode")).toEqual(fallback);
      expect(resolveStartedBy(fallback, null)).toEqual(fallback);
    });

    it("returns null when neither filename nor fallback resolve", () => {
      expect(resolveStartedBy(null, "part.gcode")).toBeNull();
      expect(resolveStartedBy(null, null)).toBeNull();
    });
  });
});
