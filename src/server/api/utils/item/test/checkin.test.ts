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
    testUser = createUser();
  });

  describe("Happy path", () => {
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

      expect(response.ok).toEqual(true);
      expect(response.data).toHaveLength(2);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Consumable rejection", () => {
    it("Should reject check-in of a single consumable", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, { available: 10, total: 100 }),
        },
      });

      const cartItem: CartItem = { itemId: consumableItem.id, quantity: 5 };

      validateCartMock([
        createOkValidationResponse({ quantity: 5, data: consumableItem }),
      ]);

      const response = await itemCheckin(testUser.id, [cartItem]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject check-in of multiple consumables", async () => {
      const item1Id = faker.string.uuid();
      const item2Id = faker.string.uuid();

      const consumable1 = createItem({
        isConsumable: true,
        overrides: {
          id: item1Id,
          consumable: createConsumable(item1Id, { available: 20, total: 100 }),
        },
      });
      const consumable2 = createItem({
        isConsumable: true,
        overrides: {
          id: item2Id,
          consumable: createConsumable(item2Id, { available: 30, total: 150 }),
        },
      });

      validateCartMock([
        createOkValidationResponse({ quantity: 5, data: consumable1 }),
        createOkValidationResponse({ quantity: 10, data: consumable2 }),
      ]);

      const response = await itemCheckin(testUser.id, [
        { itemId: consumable1.id, quantity: 5 },
        { itemId: consumable2.id, quantity: 10 },
      ]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject a mixed cart containing a consumable and a loaned asset", async () => {
      const itemId = faker.string.uuid();
      const consumableItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, { available: 15, total: 100 }),
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

      validateCartMock([
        createOkValidationResponse({ quantity: 3, data: consumableItem }),
        createOkValidationResponse({ quantity: 1, data: loanedAsset }),
      ]);

      const response = await itemCheckin(testUser.id, [
        { itemId: consumableItem.id, quantity: 3 },
        { itemId: loanedAsset.id, quantity: 1 },
      ]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should reject consumable regardless of availability level", async () => {
      const itemId = faker.string.uuid();
      const zeroStockItem = createItem({
        isConsumable: true,
        overrides: {
          id: itemId,
          consumable: createConsumable(itemId, { available: 0, total: 100 }),
        },
      });

      validateCartMock([
        createOkValidationResponse({ quantity: 5, data: zeroStockItem }),
      ]);

      const response = await itemCheckin(testUser.id, [
        { itemId: zeroStockItem.id, quantity: 5 },
      ]);

      expect(response.ok).toBe(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
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
          ItemRecords: [],
        },
      });

      const validateCartResponse = createOkValidationResponse({
        quantity: 1,
        data: neverLoanedAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [
        { itemId: neverLoanedAsset.id, quantity: 1 },
      ]);

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
              loaned: false,
            }),
          ],
        },
      });

      const validateCartResponse = createOkValidationResponse({
        quantity: 1,
        data: availableAsset,
      });

      validateCartMock([validateCartResponse]);

      const response = await itemCheckin(testUser.id, [
        { itemId: availableAsset.id, quantity: 1 },
      ]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("Should handle validation errors from validateCart", async () => {
      const item = createItem();
      const cartItem: CartItem = { itemId: item.id, quantity: 1 };

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

    it("Should handle database transaction errors for assets", async () => {
      const loanedAsset = createItem({
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

      validateCartMock([
        createOkValidationResponse({ quantity: 1, data: loanedAsset }),
      ]);

      const dbError = new Error("Connection failed");
      prismaMock.$transaction.mockRejectedValueOnce(dbError);

      const response = await itemCheckin(testUser.id, [
        { itemId: loanedAsset.id, quantity: 1 },
      ]);

      expect(response?.ok).toBe(false);
      expect(response?.failures).toBe("Connection failed");
    });

    it("Should handle mixed failure - valid asset and never-loaned asset", async () => {
      const loanedAsset = createItem({
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

      const neverLoanedAsset = createItem({
        isConsumable: false,
        overrides: {
          stored: true,
          ItemRecords: [],
        },
      });

      validateCartMock([
        createOkValidationResponse({ quantity: 1, data: loanedAsset }),
        createOkValidationResponse({ quantity: 1, data: neverLoanedAsset }),
      ]);

      const response = await itemCheckin(testUser.id, [
        { itemId: loanedAsset.id, quantity: 1 },
        { itemId: neverLoanedAsset.id, quantity: 1 },
      ]);

      expect(response.ok).toEqual(false);
      expect(response.failures).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("Performance and stress tests", () => {
    it("Should handle checkin of many loaned assets efficiently", async () => {
      const itemCount = 50;
      const cartItems: CartItem[] = [];
      const validateResponses = [];

      for (let i = 0; i < itemCount; i++) {
        const item = createItem({
          isConsumable: false,
          overrides: { stored: false },
        });
        item.ItemRecords = [
          createItemRecord(item.id, testUser.id, { loaned: true }),
        ];

        cartItems.push({ itemId: item.id, quantity: 1 });
        validateResponses.push(
          createOkValidationResponse({ quantity: 1, data: item }),
        );
      }

      validateCartMock(validateResponses);

      const response = await itemCheckin(testUser.id, cartItems);

      expect(response.ok).toEqual(true);
      expect(response.data).toHaveLength(50);
      response.data!.forEach((item) => {
        expect(item.ok).toEqual(true);
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
