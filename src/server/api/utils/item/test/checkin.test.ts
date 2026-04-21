import { describe, it, vi, expect, beforeEach } from "vitest";
import { faker } from "@faker-js/faker";
import {
  createItem,
  createUser,
  createConsumable,
  createItemRecord,
  type User,
} from "@/server/lib/dbMockFactory";
import {
  createOkValidationResponse,
  type CartValidationResponse,
} from "./mockTestTypes";
import type { CartItem } from "../item.utils";
import { itemCheckin } from "../item.checkin";
import { validateCart } from "../item.utils";
import prismaMock from "@/server/lib/__mocks__/prisma";
import { createValidationError } from "../../endpoint.utils";

vi.mock("../item.utils");

const validateCartMock = (data: CartValidationResponse[]) => {
  vi.mocked(validateCart).mockResolvedValueOnce(data);
};

describe("Item checkin tests", () => {
  let testUser: User;

  beforeEach(() => {
    // Create a test user for all tests
    testUser = createUser();
  });

  describe("Happy path", () => {
    it("Should checkin 1 consumable item", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 10,
            total: 100,
          }),
        },
      });

      const cartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 5,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkin 1 loaned asset item", async () => {
      const loanedAsset = createItem({
        isConsumable: false,
        isLoaned: true,
        user: testUser,
        overrides: {
          stored: false,
        },
      });

      loanedAsset.ItemRecords = [
        createItemRecord(loanedAsset.id, testUser.id, {
          loaned: true,
        }),
      ];

      const cartItem: CartItem = {
        itemId: loanedAsset.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: loanedAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkin multiple items (consumables and assets)", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, {
            available: 15,
            total: 100,
          }),
        },
      });

      const loanedAsset = createItem({
        isConsumable: false,
        isLoaned: true,
        user: testUser,
        overrides: {
          stored: false,
          ItemRecords: [
            createItemRecord(faker.string.uuid(), testUser.id, {
              loaned: true,
            }),
          ],
        },
      });

      const consumableCartItem: CartItem = {
        itemId: consumableItem.id,
        quantity: 3,
      };
      const assetCartItem: CartItem = {
        itemId: loanedAsset.id,
        quantity: 1,
      };

      const validateCartResponses = [
        createOkValidationResponse({
          quantity: consumableCartItem.quantity,
          data: consumableItem,
        }),
        createOkValidationResponse({
          quantity: assetCartItem.quantity,
          data: loanedAsset,
        }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckin(testUser.id, [
        consumableCartItem,
        assetCartItem,
      ]);

      expect(response.ok).toEqual(true); // Success
      expect(response.data).toHaveLength(2);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkin multiple consumables", async () => {
      const item1Id = faker.string.uuid();
      const item2Id = faker.string.uuid();

      const consumable1 = createItem({
        isConsumable: true,
        overrides: {
          id: item1Id,
          consumable: createConsumable(item1Id, {
            available: 20,
            total: 100,
          }),
        },
      });

      const consumable2 = createItem({
        isConsumable: true,
        overrides: {
          id: item2Id,
          consumable: createConsumable(item2Id, {
            available: 30,
            total: 150,
          }),
        },
      });

      const cartItems: CartItem[] = [
        { itemId: consumable1.id, quantity: 5 },
        { itemId: consumable2.id, quantity: 10 },
      ];

      const validateCartResponses = [
        createOkValidationResponse({
          quantity: 5,
          data: consumable1,
        }),
        createOkValidationResponse({
          quantity: 10,
          data: consumable2,
        }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckin(testUser.id, cartItems);

      expect(response.ok).toEqual(true); // Success
      expect(response.data).toHaveLength(2);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("Should checkin multiple loaned assets", async () => {
      const asset1 = createItem({
        isConsumable: false,
        overrides: {
          stored: false,
          ItemRecords: [
            createItemRecord(faker.string.uuid(), testUser.id, {
              loaned: true,
            }),
          ],
        },
      });

      const asset2 = createItem({
        isConsumable: false,
        overrides: {
          stored: false,
          ItemRecords: [
            createItemRecord(faker.string.uuid(), testUser.id, {
              loaned: true,
            }),
          ],
        },
      });

      const cartItems: CartItem[] = [
        { itemId: asset1.id, quantity: 1 },
        { itemId: asset2.id, quantity: 1 },
      ];

      const validateCartResponses = [
        createOkValidationResponse({ quantity: 1, data: asset1 }),
        createOkValidationResponse({ quantity: 1, data: asset2 }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckin(testUser.id, cartItems);

      expect(response.ok).toEqual(true); // Success
      expect(response.data).toHaveLength(2);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error cases", () => {
    it("Should reject empty cart", async () => {
      const response = await itemCheckin(testUser.id, []);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject asset that has never been loaned out", async () => {
      const neverLoanedAsset = createItem({
        isConsumable: false,
        overrides: {
          stored: true,
          ItemRecords: [], // Empty records - never been loaned
        },
      });

      const cartItem: CartItem = {
        itemId: neverLoanedAsset.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: neverLoanedAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject asset that is not currently loaned out", async () => {
      const availableAsset = createItem({
        isConsumable: false,
        overrides: {
          stored: true,
          ItemRecords: [
            createItemRecord(faker.string.uuid(), testUser.id, {
              loaned: false, // Previously loaned but now returned
            }),
          ],
        },
      });

      const cartItem: CartItem = {
        itemId: availableAsset.id,
        quantity: 1,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: availableAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should handle validation errors from validateCart", async () => {
      const item = createItem();
      const cartItem: CartItem = {
        itemId: item.id,
        quantity: 1,
      };

      // Mock validateCart to return validation errors
      const error = createValidationError([
        { ok: false as const, error: "Item not found" },
      ]);
      vi.mocked(validateCart).mockRejectedValueOnce(error);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toEqual([
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
        quantity: 5,
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: consumableItem,
      });

      validateCartMock([validateCartResponse]);

      // Mock transaction to fail
      const dbError = new Error("Database error");
      dbError.message = "Connection failed";
      prismaMock.$transaction.mockRejectedValueOnce(dbError);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBe("Connection failed");
    });

    it("Should handle mixed failure items - some valid, some invalid", async () => {
      // Valid consumable
      const validItemId = faker.string.uuid();
      const validConsumable = createItem({
        isConsumable: true,
        overrides: {
          id: validItemId,
          consumable: createConsumable(validItemId, {
            available: 10,
            total: 100,
          }),
        },
      });

      // Invalid asset (never loaned)
      const invalidAsset = createItem({
        isConsumable: false,
        overrides: {
          stored: true,
          ItemRecords: [], // Never been loaned
        },
      });

      const cartItems: CartItem[] = [
        { itemId: validConsumable.id, quantity: 2 },
        { itemId: invalidAsset.id, quantity: 1 },
      ];

      const validateCartResponses = [
        createOkValidationResponse({ quantity: 2, data: validConsumable }),
        createOkValidationResponse({ quantity: 1, data: invalidAsset }),
      ];

      validateCartMock(validateCartResponses);

      const response = await itemCheckin(testUser.id, cartItems);

      expect(response.ok).toEqual(false); // Success
      expect(response.failures).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("Should handle consumable with zero current availability", async () => {
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
        quantity: 10, // Adding stock back
      };

      const validateCartResponse = createOkValidationResponse({
        quantity: cartItem.quantity,
        data: zeroStockItem,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response.ok).toEqual(true); // Success
      expect(response.data).toHaveLength(1);
      expect(response.data).toEqual([
        {
          ok: true,
          uuid: itemId,
          quantity: 10,
        },
      ]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Performance and stress tests", () => {
    it("Should handle checkin of many items efficiently", async () => {
      const itemCount = 50;
      const cartItems: CartItem[] = [];
      const validateResponses = [];

      // Create mix of consumables and loaned assets
      for (let i = 0; i < itemCount; i++) {
        let item;
        let quantity;

        if (i % 2 === 0) {
          // Consumable
          const itemId = faker.string.uuid();
          item = createItem({
            isConsumable: true,
            overrides: {
              id: itemId,
              consumable: createConsumable(itemId, {
                available: faker.number.int({ min: 10, max: 50 }),
                total: 100,
              }),
            },
          });
          quantity = faker.number.int({ min: 1, max: 5 });
        } else {
          // Loaned asset
          item = createItem({
            isConsumable: false,
            overrides: {
              stored: false,
            },
          });

          item.ItemRecords = [
            createItemRecord(item.id, testUser.id, { loaned: true }),
          ];
          quantity = 1;
        }

        cartItems.push({
          itemId: item.id,
          quantity: quantity,
        });

        validateResponses.push(
          createOkValidationResponse({
            quantity: quantity,
            data: item,
          }),
        );
      }

      validateCartMock(validateResponses);

      const response = await itemCheckin(testUser.id, cartItems);

      expect(response.ok).toEqual(true); // Success
      expect(response.data).toHaveLength(50);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
