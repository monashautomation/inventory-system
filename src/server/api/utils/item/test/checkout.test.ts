import { describe, it, vi, expect, beforeEach } from "vitest";
import { faker } from "@faker-js/faker";
import {
  createItem,
  createUser,
  createLocation,
  createTag,
  createConsumable,
  createConsumableItem,
  createAssetItem,
  createLoanedAsset,
  createAvailableAsset,
  type Item,
  type User,
} from "@/server/lib/dbMockFactory";
import {
  createOkValidationResponse,
  type CartValidationResponse,
} from "./mockTestTypes";
import { itemCheckout } from "../item.checkout";
import { validateCart, type CartItem } from "../item.utils";
import prismaMock from "@/server/lib/__mocks__/prisma";
import { createValidationError } from "../../endpoint.utils";

vi.mock("../item.utils");

const validateCartMock = (data: CartValidationResponse[]) => {
  vi.mocked(validateCart).mockResolvedValueOnce(data);
};

describe("Item checkout testings", () => {
  let testUser: User;

  beforeEach(() => {
    testUser = createUser();
  });

  describe("Happy path", () => {
    it("Should checkout 1 consumable item", async () => {
      const consumableItem = createConsumableItem();
      const cartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        uuid: consumableItem.id,
        requestedQuantity: 1,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkout 1 asset item", async () => {
      const assetItem = createAvailableAsset();
      const cartItem: CartItem = {
        itemId: assetItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: assetItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        uuid: assetItem.id,
        available: 1,
        requestedQuantity: 1,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkout multiple items (consumables and assets)", async () => {
      const consumableItem = createConsumableItem();
      const assetItem = createAvailableAsset();

      const consumableCartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 2,
      };
      const assetCartItem: CartItem = {
        itemId: assetItem.id,
        quantity: 1,
      };

      const validateCartResponses = [
        createOkValidationResponse({
          quantity: consumableCartItem.quantity,
          data: consumableItem,
        }),
        createOkValidationResponse({
          quantity: assetCartItem.quantity,
          data: assetItem,
        }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckout(testUser.id, [
        consumableCartItem,
        assetCartItem,
      ]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkout asset with no previous records", async () => {
      const assetItem = createAssetItem({
        ItemRecords: [],
        stored: true,
      });

      const cartItem: CartItem = {
        itemId: assetItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: assetItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        uuid: assetItem.id,
        available: 1,
        requestedQuantity: 1,
      });
    });
  });

  describe("Error cases", () => {
    it("Should reject empty cart", async () => {
      const response = await itemCheckout(testUser.id, []);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject consumable with insufficient quantity", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 5,
            total: 100,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 15, // More than available
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject already loaned asset", async () => {
      const loanedAsset = createLoanedAsset(testUser);

      const cartItem: CartItem = {
        itemId: loanedAsset.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: loanedAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should handle validation errors from validateCart", async () => {
      const cartItem: CartItem = {
        itemId: faker.string.uuid(),
        quantity: 1,
      };

      const error = createValidationError([
        { ok: false as const, error: "Item not found" },
      ]);
      vi.mocked(validateCart).mockRejectedValueOnce(error);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toEqual([
        { ok: false as const, error: "Item not found" },
      ]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should handle database transaction errors", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 10,
            total: 20,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      const dbError = new Error("Database error");
      dbError.message = "Connection failed";
      prismaMock.$transaction.mockRejectedValueOnce(dbError);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBe("Connection failed");
    });

    it("Should handle mixed failure items", async () => {
      const lowStockId = faker.string.uuid();
      const lowStockConsumable = createItem({
        isConsumable: true,
        overrides: {
          id: lowStockId,
          consumable: createConsumable(lowStockId, {
            available: 1,
            total: 100,
          }),
        },
      });

      const assetItem = createAvailableAsset();

      const consumableCartItem: CartItem = {
        itemId: lowStockConsumable.id,
        quantity: 20, // More than available
      };
      const assetCartItem: CartItem = {
        itemId: assetItem.id,
        quantity: 1,
      };

      const validateCartResponses = [
        createOkValidationResponse({
          quantity: consumableCartItem.quantity,
          data: lowStockConsumable,
        }),
        createOkValidationResponse({
          quantity: assetCartItem.quantity,
          data: assetItem,
        }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckout(testUser.id, [
        consumableCartItem,
        assetCartItem,
      ]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("Should handle consumable with exact available quantity", async () => {
      const requestedQuantity = 5;
      const itemId = faker.string.uuid();

      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: requestedQuantity,
            total: 100,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: requestedQuantity,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        requestedQuantity: requestedQuantity,
      });
    });

    it("Should handle large quantity checkout", async () => {
      const largeQuantity = 100;
      const itemId = faker.string.uuid();

      const highStockItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 150,
            total: 200,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: highStockItem.id,
        quantity: largeQuantity,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: highStockItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        requestedQuantity: largeQuantity,
      });
    });

    it("Should handle zero available consumable", async () => {
      const itemId = faker.string.uuid();
      const zeroStockItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 0,
            total: 100,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: zeroStockItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: zeroStockItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
    });

    it("Should handle multiple users checking out different items", async () => {
      const user1 = createUser();
      const user2 = createUser();

      const item1 = createConsumableItem();
      const item2 = createAvailableAsset();

      const cartItem1: CartItem = {
        itemId: item1.id,
        quantity: 1,
      };
      const cartItem2: CartItem = {
        itemId: item2.id,
        quantity: 1,
      };

      // User 1 checks out consumable
      validateCartMock([
        createOkValidationResponse({
          quantity: cartItem1.quantity,
          data: item1,
        }),
      ]);

      const response1 = await itemCheckout(user1.id, [cartItem1]);
      expect(response1.ok).toBe(true);

      vi.clearAllMocks();

      // User 2 checks out asset
      validateCartMock([
        createOkValidationResponse({
          quantity: cartItem2.quantity,
          data: item2,
        }),
      ]);

      const response2 = await itemCheckout(user2.id, [cartItem2]);
      expect(response2.ok).toBe(true);
    });

    it("Should handle item with complex relations", async () => {
      const location = createLocation({ name: "Test Warehouse" });
      const tags = [
        createTag({ name: "Electronics", type: "category" }),
        createTag({ name: "High Priority", type: "priority" }),
      ];

      const complexItem = createItem({
        location,
        tags,
        user: testUser,
        isConsumable: true,
      });

      const cartItem: CartItem = {
        itemId: complexItem.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: complexItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckout(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0]).toMatchObject({
        ok: true,
        uuid: complexItem.id,
        requestedQuantity: 1,
      });
    });
  });

  describe("Performance and stress tests", () => {
    it("Should handle checkout of many items efficiently", async () => {
      const itemCount = 50;
      const items: Item[] = [];
      const cartItems: CartItem[] = [];
      const validateResponses = [];

      for (let i = 0; i < itemCount; i++) {
        const item =
          i % 2 === 0 ? createConsumableItem() : createAvailableAsset();

        items.push(item);
        cartItems.push({
          itemId: item.id,
          quantity: 1,
        });
        validateResponses.push(
          createOkValidationResponse({
            quantity: 1,
            data: item,
          }),
        );
      }

      validateCartMock(validateResponses);

      const response = await itemCheckout(testUser.id, cartItems);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(itemCount);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
