import { z } from "zod";
import type { inferProcedureOutput } from "@trpc/server";
import type { auditLogRouter } from "@/server/api/routers/auditLog";

export const auditActionSchema = z.enum([
  "REQUEST_CREATED",
  "REQUEST_STATUS_CHANGED",
  "REQUEST_CANCELLED",
  "REQUEST_RECEIVED",
]);
export type AuditActionType = z.infer<typeof auditActionSchema>;

export const listAuditLogsInput = z
  .object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    actorId: z.uuid().optional(),
    action: auditActionSchema.optional(),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .default({ page: 0, pageSize: 50 });

export const forEntityInput = z.object({
  entityType: z.string(),
  entityId: z.string(),
});

export type AuditLogListOutput = inferProcedureOutput<
  (typeof auditLogRouter)["list"]
>;
export type AuditLogItem = AuditLogListOutput["items"][number];
