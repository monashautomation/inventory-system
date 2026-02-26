// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  hashBufferSha256,
  hasAllowedGcodeExtension,
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
});
