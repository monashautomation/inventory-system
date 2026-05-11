import { z } from "zod";
import type { inferProcedureOutput } from "@trpc/server";
import type { consumableRequestRouter } from "@/server/api/routers/consumableRequest";
import { supplierUrlSchema } from "./consumableSupplier.schema";

export const requestStatusSchema = z.enum([
  "PENDING",
  "ORDERED",
  "RECEIVED",
  "CANCELLED",
]);
export type RequestStatusType = z.infer<typeof requestStatusSchema>;

export const createRequestInput = z
  .object({
    consumableId: z.uuid("Invalid consumable ID"),
    quantity: z
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(100000, "Quantity too large"),
    supplierId: z.uuid().nullable().optional(),
    customSupplier: z.string().min(1).max(120).optional().nullable(),
    customUrl: supplierUrlSchema.optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine(
    (input) => {
      // Either pick a saved supplier OR provide a custom one (name + url)
      if (input.supplierId) return true;
      if (input.customSupplier && input.customUrl) return true;
      // Allow neither — falls back to primary on the server
      return !input.customSupplier && !input.customUrl;
    },
    {
      message:
        "Provide a saved supplier, or both a custom supplier name and URL, or leave blank to use the primary",
      path: ["customSupplier"],
    },
  );

export const updateRequestStatusInput = z
  .object({
    id: z.uuid(),
    status: requestStatusSchema,
    fulfilledQty: z
      .number()
      .int()
      .min(1, "Fulfilled quantity must be at least 1")
      .max(100000)
      .optional()
      .nullable(),
    cancelReason: z.string().max(500).optional().nullable(),
  })
  .refine(
    (input) =>
      input.status !== "RECEIVED" ||
      (input.fulfilledQty !== null && input.fulfilledQty !== undefined),
    {
      message: "fulfilledQty is required when marking as RECEIVED",
      path: ["fulfilledQty"],
    },
  );

export const listRequestsInput = z
  .object({
    status: requestStatusSchema.optional(),
    consumableId: z.uuid().optional(),
    requestedById: z.uuid().optional(),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .default({ page: 0, pageSize: 50 });

export type ConsumableRequestCreateOutput = inferProcedureOutput<
  (typeof consumableRequestRouter)["create"]
>;
export type ConsumableRequestListOutput = inferProcedureOutput<
  (typeof consumableRequestRouter)["list"]
>;
