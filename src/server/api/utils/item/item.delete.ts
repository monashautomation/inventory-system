import { prisma } from "@/server/lib/prisma";
import { TRPCError } from "@trpc/server";
import { getByUuid } from "./item.utils";

type Item = Awaited<ReturnType<typeof getByUuid>>;

export const itemBulkDelete = async (ids: string[]) => {
  const items = await validateDeleteItems(ids);

  for (const item of items) {
    await itemInLoan(item);
  }

  await prisma.item.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      deleted: true,
    },
  });

  return { ok: true, message: "Items successfully deleted" };
};

const validateDeleteItems = async (ids: string[]) => {
  return await Promise.all(
    ids.map(async (id) => {
      const itemResponse = await getByUuid(id);
      return itemResponse;
    }),
  );
};

const itemInLoan = async (item: Item) => {
  if (!item) {
    return;
  }

  const itemRecords = await prisma.itemRecord.findMany({
    where: {
      itemId: item.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      item: {
        include: {
          consumable: true,
        },
      },
    },
  });

  if (itemRecords.length === 0) {
    return;
  }

  const mostRecentRecord = itemRecords[0];

  // One item result from query, this is loaned
  if (itemRecords.length < 2 && mostRecentRecord.loaned) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Failed to delete, ${item.name} currently in loan!`,
    });
  }

  // Handle assets, we only need to look at the most recent transaction
  if (!mostRecentRecord.item.consumable && mostRecentRecord.loaned) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Failed to delete, ${item.name} currently in loan!`,
    });
  }

  const loanedCount = itemRecords.reduce((acc, record) => {
    const curVal = record.loaned ? record.quantity : -record.quantity;
    return acc + curVal;
  }, 0);

  if (loanedCount === 0) {
    return;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Failed to delete, ${item.name} currently in loan!`,
  });
};
