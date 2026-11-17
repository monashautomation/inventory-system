import { describe, it, expect } from "vitest";
import { buildQrUrl, getQrBaseUrl, normalizeBaseUrl } from "@/server/lib/qrUrl";

const ID = "e8625238-b081-49b3-ad39-fb6331fa016a";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes, query and hash", () => {
    expect(normalizeBaseUrl("https://inv.example.com/")).toBe(
      "https://inv.example.com",
    );
    expect(normalizeBaseUrl("https://inv.example.com///")).toBe(
      "https://inv.example.com",
    );
    expect(normalizeBaseUrl("https://inv.example.com/?a=1#x")).toBe(
      "https://inv.example.com",
    );
  });

  it("keeps a path prefix and an explicit port", () => {
    expect(normalizeBaseUrl("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(normalizeBaseUrl("https://example.com/inventory/")).toBe(
      "https://example.com/inventory",
    );
  });

  it("trims whitespace", () => {
    expect(normalizeBaseUrl("  https://inv.example.com  ")).toBe(
      "https://inv.example.com",
    );
  });

  it("rejects empty, non-URL and non-http(s) values", () => {
    expect(normalizeBaseUrl(undefined)).toBeNull();
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("   ")).toBeNull();
    expect(normalizeBaseUrl("not a url")).toBeNull();
    expect(normalizeBaseUrl("inv.example.com")).toBeNull();
    expect(normalizeBaseUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeBaseUrl("ftp://example.com")).toBeNull();
  });
});

describe("getQrBaseUrl", () => {
  it("prefers QR_BASE_URL over FRONTEND_URL", () => {
    expect(
      getQrBaseUrl({
        QR_BASE_URL: "https://qr.example.com/",
        FRONTEND_URL: "http://localhost:5173",
      }),
    ).toBe("https://qr.example.com");
  });

  it("falls back to FRONTEND_URL, with or without a trailing slash", () => {
    expect(getQrBaseUrl({ FRONTEND_URL: "http://localhost:5173" })).toBe(
      "http://localhost:5173",
    );
    expect(getQrBaseUrl({ FRONTEND_URL: "http://localhost:5173/" })).toBe(
      "http://localhost:5173",
    );
  });

  it("falls back to FRONTEND_URL when QR_BASE_URL is invalid", () => {
    expect(
      getQrBaseUrl({
        QR_BASE_URL: "not a url",
        FRONTEND_URL: "https://inv.example.com",
      }),
    ).toBe("https://inv.example.com");
  });

  it("falls back to localhost on the configured port", () => {
    expect(getQrBaseUrl({ PORT: "4000" })).toBe("http://localhost:4000");
    expect(getQrBaseUrl({})).toBe("http://localhost:3000");
  });
});

describe("buildQrUrl", () => {
  it("always puts exactly one slash before qr/", () => {
    expect(buildQrUrl("https://inv.example.com", ID)).toBe(
      `https://inv.example.com/qr/${ID}`,
    );
    expect(
      buildQrUrl(getQrBaseUrl({ FRONTEND_URL: "http://localhost:5173" }), ID),
    ).toBe(`http://localhost:5173/qr/${ID}`);
    expect(
      buildQrUrl(getQrBaseUrl({ FRONTEND_URL: "http://localhost:5173/" }), ID),
    ).toBe(`http://localhost:5173/qr/${ID}`);
  });
});
