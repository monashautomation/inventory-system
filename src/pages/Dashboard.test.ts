import { describe, expect, it } from "vitest";

import { formatConsumableTotalCost } from "./Dashboard";

describe("formatConsumableTotalCost", () => {
  it("formats total cost directly as dollars without cent conversion", () => {
    expect(formatConsumableTotalCost(125)).toBe("$125.00");
  });

  it("keeps cents precision for fractional totals", () => {
    expect(formatConsumableTotalCost(12.345)).toBe("$12.35");
  });
});
