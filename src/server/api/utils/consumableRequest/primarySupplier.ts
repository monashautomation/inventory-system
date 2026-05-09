import type { ExtendedTransactionClient } from "../endpoint.utils";

/**
 * Resolves the effective primary supplier for a consumable:
 * 1. Supplier with isPrimary=true.
 * 2. Otherwise, the supplier on the most-recently-created request that has one.
 * 3. Otherwise, null (no suggestion).
 */
export async function resolvePrimarySupplierId(
  tx: ExtendedTransactionClient,
  consumableId: string,
): Promise<string | null> {
  const flagged = await tx.consumableSupplier.findFirst({
    where: { consumableId, isPrimary: true },
    select: { id: true },
  });
  if (flagged) return flagged.id;

  const lastRequestWithSupplier = await tx.consumableRequest.findFirst({
    where: { consumableId, supplierId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { supplierId: true },
  });
  return lastRequestWithSupplier?.supplierId ?? null;
}
