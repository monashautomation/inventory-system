import * as matchers from "@testing-library/jest-dom/matchers";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { startServer, stopServer } from "../server/testing";
import prismaMock from "@/server/lib/__mocks__/prisma";
import { faker } from "@faker-js/faker";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
expect.extend(matchers);

beforeAll(async () => {
  faker.seed(6767);
  await startServer();
});

afterAll(() => {
  stopServer();
});

afterEach(() => {
  cleanup();
});

vi.mock("@/server/lib/prisma", () => ({
  prisma: prismaMock,
}));
