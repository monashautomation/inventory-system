import { z } from "zod";
import type { inferProcedureOutput } from "@trpc/server";
import type { consumableSupplierRouter } from "@/server/api/routers/consumableSupplier";

export const supplierUrlSchema = z
  .url("Must be a valid URL")
  .max(2048, "URL too long")
  .refine((url) => /^https?:\/\//i.test(url), {
    message: "URL must start with http:// or https://",
  });

export const createSupplierInput = z.object({
  consumableId: z.uuid("Invalid consumable ID"),
  name: z
    .string()
    .min(1, "Supplier name is required")
    .max(120, "Name too long"),
  url: supplierUrlSchema,
  sku: z.string().max(120, "SKU too long").optional().nullable(),
  notes: z.string().max(500, "Notes too long").optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

export const updateSupplierInput = z.object({
  id: z.uuid(),
  data: z.object({
    name: z.string().min(1).max(120).optional(),
    url: supplierUrlSchema.optional(),
    sku: z.string().max(120).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  }),
});

export const setPrimarySupplierInput = z.object({
  consumableId: z.uuid(),
  supplierId: z.uuid().nullable(),
});

export type ConsumableSupplierCreateOutput = inferProcedureOutput<
  (typeof consumableSupplierRouter)["create"]
>;
export type ConsumableSupplierListOutput = inferProcedureOutput<
  (typeof consumableSupplierRouter)["listForConsumable"]
>;
