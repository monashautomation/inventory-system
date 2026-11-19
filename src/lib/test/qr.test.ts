import { describe, it, expect } from "vitest";
import { parseQrItemId } from "@/lib/qr";

const ID = "e8625238-b081-49b3-ad39-fb6331fa016a";

describe("parseQrItemId", () => {
  it("reads the id from a full label URL, whatever the host", () => {
    expect(parseQrItemId(`https://inventory.example.com/qr/${ID}`)).toBe(ID);
    expect(parseQrItemId(`http://localhost:5173/qr/${ID}`)).toBe(ID);
  });

  it("accepts a bare path, a bare id, and surrounding whitespace", () => {
    expect(parseQrItemId(`/qr/${ID}`)).toBe(ID);
    expect(parseQrItemId(ID)).toBe(ID);
    expect(parseQrItemId(`  https://x.test/qr/${ID}\n`)).toBe(ID);
  });

  it("ignores query strings, hashes and trailing slashes", () => {
    expect(parseQrItemId(`https://x.test/qr/${ID}?utm=1#top`)).toBe(ID);
    expect(parseQrItemId(`https://x.test/qr/${ID}/`)).toBe(ID);
  });

  it("returns null for anything that is not an item id", () => {
    expect(parseQrItemId("")).toBeNull();
    expect(parseQrItemId("hello world")).toBeNull();
    expect(parseQrItemId("https://example.com/qr/")).toBeNull();
    expect(parseQrItemId("https://example.com/qr/not-a-uuid")).toBeNull();
  });
});
