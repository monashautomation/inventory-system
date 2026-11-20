import { describe, it, expect } from "vitest";
import {
  blockedPrinterReasons,
  evaluateTargeting,
  type GatePrinter,
} from "@/lib/queueGate";

const ok = (id: number, model = "X1C"): GatePrinter => ({
  id,
  name: `PRNT00${id}`,
  model,
  blockingErrors: [],
});
const bad = (id: number, model = "X1C"): GatePrinter => ({
  id,
  name: `PRNT00${id}`,
  model,
  blockingErrors: ["0x20001 The front cover of the toolhead fell off."],
});

describe("evaluateTargeting", () => {
  it("allows a specific healthy printer and blocks a specific broken one", () => {
    const printers = [ok(1), bad(2)];
    expect(
      evaluateTargeting({ mode: "printer", printerId: 1 }, printers).allowed,
    ).toBe(true);
    const r = evaluateTargeting({ mode: "printer", printerId: 2 }, printers);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/PRNT002/);
    expect(r.reason).toMatch(/front cover/);
  });

  it("model: allowed while at least one printer of that model is healthy", () => {
    expect(
      evaluateTargeting({ mode: "model", model: "X1C" }, [bad(1), ok(2)])
        .allowed,
    ).toBe(true);
  });

  it("model: blocked only when every printer of that model is broken", () => {
    const r = evaluateTargeting({ mode: "model", model: "X1C" }, [
      bad(1),
      bad(2),
      ok(3, "P1S"),
    ]);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Every X1C printer/);
  });

  it("any: blocked only when every printer is broken", () => {
    expect(
      evaluateTargeting({ mode: "any" }, [bad(1), ok(2, "P1S")]).allowed,
    ).toBe(true);
    expect(
      evaluateTargeting({ mode: "any" }, [bad(1), bad(2, "P1S")]).allowed,
    ).toBe(false);
  });

  it("does not block when there is nothing to judge", () => {
    expect(evaluateTargeting({ mode: "any" }, []).allowed).toBe(true);
    expect(
      evaluateTargeting({ mode: "model", model: "H2D" }, [bad(1)]).allowed,
    ).toBe(true);
    expect(
      evaluateTargeting({ mode: "printer", printerId: 9 }, [bad(1)]).allowed,
    ).toBe(true);
  });
});

describe("blockedPrinterReasons", () => {
  it("lists only blocked printers, with the first error and a count of the rest", () => {
    const two: GatePrinter = { ...bad(2), blockingErrors: ["a", "b", "c"] };
    const reasons = blockedPrinterReasons([ok(1), two]);
    expect([...reasons.keys()]).toEqual([2]);
    expect(reasons.get(2)).toBe("PRNT002: a (+2 more)");
  });
});
