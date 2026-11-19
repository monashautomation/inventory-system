/** Who has an item right now, derived from its loan records. */

export type LoanState = "lab" | "loaned" | "stored";

interface RecordLike {
  loaned: boolean;
  createdAt: Date | string;
  actionByUserId?: string | null;
}

interface ItemLike {
  stored: boolean;
  ItemRecords?: RecordLike[];
}

export function latestRecord<T extends RecordLike>(
  records: T[] | undefined,
): T | undefined {
  return records
    ?.slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
}

export function getLoanState(item: ItemLike, currentUserId?: string | null) {
  const latest = latestRecord(item.ItemRecords);
  const state: LoanState =
    item.stored === false ? "lab" : latest?.loaned ? "loaned" : "stored";
  const heldByMe =
    state === "loaned" &&
    !!currentUserId &&
    latest?.actionByUserId === currentUserId;
  return { state, heldByMe, latest };
}
