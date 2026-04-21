import { consumableInput } from "@/server/schema";
import {
  filterErrors,
  type ExtendedTransactionClient,
} from "../endpoint.utils";
import { type CartItem } from "./item.utils";
import { z } from "zod";
import { prisma } from "@/server/lib/prisma";
import type { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { validateCart } from "./item.utils";
import type { ItemRecord } from "@prisma/client";

interface CartObject {
  ok: boolean;
  uuid: string;
  requestedQuantity: number;
  available: number;
}

export const itemCheckout = async (ctx: string, cart: CartItem[]) => {
  try {
    const validCart = await validateCart(cart);
    filterErrors(validCart);

    const consumables = validCart
      .filter((response) => response.data!.consumable != null)
      .map((response) =>
        consumableHasEnoughAvailable(
          response.data!.consumable!,
          response.quantity,
        ),
      );

    const assets = validCart
      .filter(
        (response) =>
          response.data!.consumable == null &&
          response.data!.ItemRecords != null,
      )
      .map((response) =>
        assetIsAvailable(response.data!.ItemRecords, response.data!.id),
      );

    filterErrors([...consumables, ...assets]);

    await prisma.$transaction(async (tx) => {
      const consumableUpdates = consumables as CartObject[];
      const assetUpdates = assets as CartObject[];
      await consumableDecrementQuantity(tx, consumableUpdates);
      await createItemRecord(ctx, tx, [...consumableUpdates, ...assetUpdates]);
    });

    return {
      ok: true,
      data: [...consumables, ...assets],
    };
  } catch (error) {
    if (error instanceof Error && "items" in error) {
      return { ok: false, failures: error.items };
    }
    const prismaError = error as PrismaClientKnownRequestError;
    return {
      ok: false,
      failures: prismaError.message,
    };
  }
};

const createItemRecord = async (
  ctx: string,
  tx: ExtendedTransactionClient,
  items: CartObject[],
) => {
  const itemRecordData = items.map((item) => ({
    loaned: true,
    actionByUserId: ctx,
    itemId: item.uuid,
    quantity: item.requestedQuantity,
  }));

  await tx.itemRecord.createMany({
    data: itemRecordData,
  });
};

const consumableDecrementQuantity = async (
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
              available: consumable.available - consumable.requestedQuantity,
            },
          },
        },
      });
    }),
  );
};

const assetIsAvailable = (itemRecord: ItemRecord[], uuid: string) => {
  if (itemRecord.length == 0) {
    return {
      ok: true,
      uuid: uuid,
      available: 1,
      requestedQuantity: 1,
    };
  }

  const latestItemRecord = itemRecord[0];

  if (latestItemRecord.loaned) {
    return {
      ok: false,
      failure: `Item ${uuid} is already loaned out`,
    };
  }
  return {
    ok: true,
    uuid: uuid,
    available: 1,
    requestedQuantity: 1,
  };
};

type ConsumableWithId = z.infer<typeof consumableInput> & { id: string };

const consumableHasEnoughAvailable = (
  consumable: ConsumableWithId,
  quantity: number,
) => {
  return consumable.available >= quantity
    ? {
        ok: true,
        uuid: consumable.itemId,
        available: consumable.available,
        requestedQuantity: quantity,
      }
    : {
        ok: false,
        uuid: consumable.itemId,
        requested: quantity,
        available: consumable.available,
      };
};
