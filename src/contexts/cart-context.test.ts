import { describe, expect, it } from "vitest";
import { resolveCartItemAddition, type CartItem } from "./cart-context";

const buildCartItem = (overrides: Partial<CartItem> = {}): CartItem =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    name: "Sample Item",
    quantity: 1,
    consumable: null,
    ...overrides,
  }) as CartItem;

describe("resolveCartItemAddition", () => {
  it("adds quantities when the request stays within stock", () => {
    const existingItem = buildCartItem({
      quantity: 3,
      consumable: { available: 10 } as CartItem["consumable"],
    });
    const incomingItem = buildCartItem({
      quantity: 2,
      consumable: { available: 10 } as CartItem["consumable"],
    });

    expect(resolveCartItemAddition(existingItem, incomingItem)?.quantity).toBe(
      5,
    );
  });

  it("rejects requests that would exceed available stock", () => {
    const existingItem = buildCartItem({
      quantity: 7,
      consumable: { available: 10 } as CartItem["consumable"],
    });
    const incomingItem = buildCartItem({
      quantity: 4,
      consumable: { available: 10 } as CartItem["consumable"],
    });

    expect(resolveCartItemAddition(existingItem, incomingItem)).toBeNull();
  });

  it("allows a new cart item up to the maximum available quantity", () => {
    const incomingItem = buildCartItem({ quantity: 1 });

    expect(resolveCartItemAddition(undefined, incomingItem)?.quantity).toBe(1);
  });

  it("caps non-consumables at one item", () => {
    const existingItem = buildCartItem({ quantity: 1 });
    const incomingItem = buildCartItem({ quantity: 1 });

    expect(resolveCartItemAddition(existingItem, incomingItem)).toBeNull();
  });
});
