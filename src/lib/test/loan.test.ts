import { describe, it, expect } from "vitest";
import { getLoanState, latestRecord } from "@/lib/loan";

const rec = (loaned: boolean, day: number, by = "u1") => ({
  loaned,
  createdAt: new Date(2026, 0, day),
  actionByUserId: by,
});

describe("getLoanState", () => {
  it("is stored with no records", () => {
    expect(getLoanState({ stored: true, ItemRecords: [] })).toMatchObject({
      state: "stored",
      heldByMe: false,
    });
  });

  it("uses the most recent record regardless of array order", () => {
    const item = { stored: true, ItemRecords: [rec(false, 5), rec(true, 3)] };
    expect(getLoanState(item).state).toBe("stored");
    const loaned = { stored: true, ItemRecords: [rec(true, 5), rec(false, 3)] };
    expect(getLoanState(loaned).state).toBe("loaned");
  });

  it("marks an item as held by me only when I made the latest loan", () => {
    const item = { stored: true, ItemRecords: [rec(true, 5, "me")] };
    expect(getLoanState(item, "me").heldByMe).toBe(true);
    expect(getLoanState(item, "someone-else").heldByMe).toBe(false);
    expect(getLoanState(item).heldByMe).toBe(false);
  });

  it("treats non-stored items as lab use, even if a loan record exists", () => {
    const item = { stored: false, ItemRecords: [rec(true, 5, "me")] };
    expect(getLoanState(item, "me")).toMatchObject({
      state: "lab",
      heldByMe: false,
    });
  });
});

describe("latestRecord", () => {
  it("returns undefined for no records", () => {
    expect(latestRecord(undefined)).toBeUndefined();
    expect(latestRecord([])).toBeUndefined();
  });
});
