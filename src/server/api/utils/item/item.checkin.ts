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

    const consumableIds = validCart.filter((r) => r.data!.consumable != null);
    if (consumableIds.length > 0) {
      return {
        ok: false as const,
        failures: "Consumables are consumed on checkout and cannot be returned",
      };
    }

    const assets = validCart.map((response) =>
      handleLoaned(response.data!.ItemRecords, response.data!.id),
    );

    filterErrors(assets);

    await prisma.$transaction(async (tx) => {
      const items = assets as CartObject[];
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
