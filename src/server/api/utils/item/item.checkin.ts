import {
  filterErrors,
  type ExtendedTransactionClient,
} from "../endpoint.utils";
import { validateCart, type CartItem } from "./item.utils";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/server/lib/prisma";
import type { ItemRecord } from "@prisma/client";

interface CartObject {
  ok: boolean;
  uuid: string;
  checkedQuantity: number;
  available: number;
}

export const itemCheckin = async (ctx: string, cart: CartItem[]) => {
  try {
    const validCart = await validateCart(cart);
    filterErrors(validCart);

    const consumables = validCart
      .filter((response) => response.data!.consumable != null)
      .map((response) => ({
        ok: true as const,
        uuid: response.data!.id,
        available: response.data!.consumable!.available,
        checkedQuantity: response.quantity,
      }));

    const assets = validCart
      .filter((response) => response.data!.consumable == null)
      .map((response) =>
        handleLoaned(response.data!.ItemRecords, response.data!.id),
      );

    filterErrors(assets);

    await prisma.$transaction(async (tx) => {
      await consumableIncrementQuantity(tx, consumables);
      const items = [...assets, ...consumables] as CartObject[];
      await createItemRecords(tx, ctx, items);
    });

    return {
      ok: true as const,
      data: validCart.map((item) => ({
        ok: true,
        uuid: item.data!.id,
        quantity: item.quantity,
      })),
    };
  } catch (error) {
    if (error instanceof Error && "items" in error) {
      return { ok: false as const, failures: error.items };
    }
    const prismaError = error as PrismaClientKnownRequestError;
    return {
      ok: false as const,
      failures: prismaError.message,
    };
  }
};

const handleLoaned = (itemRecord: ItemRecord[], uuid: string) => {
  if (itemRecord.length == 0) {
    return {
      ok: false as const,
      failure: `Item ${uuid} has never been loaned out`,
    };
  }

  const latestItemRecord = itemRecord[0];

  if (!latestItemRecord.loaned) {
    return {
      ok: false as const,
      failure: `Item ${uuid} is not loaned out`,
    };
  }
  return {
    ok: true as const,
    uuid: uuid,
    available: 1,
    checkedQuantity: 1,
  };
};

const consumableIncrementQuantity = async (
  tx: ExtendedTransactionClient,
  consumables: CartObject[],
) => {
  await Promise.all(
    consumables.map(async (consumable) => {
      await tx.item.update({
        where: { id: consumable.uuid },
        data: {
          consumable: {
            update: {
              available: consumable.available + consumable.checkedQuantity,
            },
          },
        },
      });
    }),
  );

  return consumables;
};

const createItemRecords = async (
  tx: ExtendedTransactionClient,
  ctx: string,
  items: CartObject[],
) => {
  const itemRecordData = items.map((item) => ({
    loaned: false,
    actionByUserId: ctx,
    itemId: item.uuid,
    quantity: item.checkedQuantity,
  }));

  await tx.itemRecord.createMany({
    data: itemRecordData,
  });
};
