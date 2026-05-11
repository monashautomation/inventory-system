import { describe, it, expect } from "vitest";
import prismaMock from "@/server/lib/__mocks__/prisma";
import { resolvePrimarySupplierId } from "../primarySupplier";
import type { ExtendedTransactionClient } from "../../endpoint.utils";

const txMock = prismaMock as unknown as ExtendedTransactionClient;

describe("resolvePrimarySupplierId", () => {
  it("returns the supplier flagged isPrimary when one exists", async () => {
    prismaMock.consumableSupplier.findFirst.mockResolvedValueOnce({
      id: "primary-id",
    } as never);

    const result = await resolvePrimarySupplierId(txMock, "consumable-1");

    expect(result).toBe("primary-id");
    expect(prismaMock.consumableRequest.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the most recent request supplier when no primary is flagged", async () => {
    prismaMock.consumableSupplier.findFirst.mockResolvedValueOnce(
      null as never,
    );
    prismaMock.consumableRequest.findFirst.mockResolvedValueOnce({
      supplierId: "recent-supplier",
    } as never);

    const result = await resolvePrimarySupplierId(txMock, "consumable-1");

    expect(result).toBe("recent-supplier");
  });

  it("returns null when neither a primary nor a prior request supplier exists", async () => {
    prismaMock.consumableSupplier.findFirst.mockResolvedValueOnce(
      null as never,
    );
    prismaMock.consumableRequest.findFirst.mockResolvedValueOnce(null as never);

    const result = await resolvePrimarySupplierId(txMock, "consumable-1");

    expect(result).toBeNull();
  });
});
