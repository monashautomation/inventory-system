import { z } from "zod";
import type { inferProcedureOutput } from "@trpc/server";
import type { notificationRouter } from "@/server/api/routers/notification";

export const notificationTypeSchema = z.enum([
  "REQUEST_ORDERED",
  "REQUEST_RECEIVED",
  "REQUEST_CANCELLED",
  "REQUEST_PARTIAL",
]);
export type NotificationTypeType = z.infer<typeof notificationTypeSchema>;

export const listNotificationsInput = z
  .object({
    unreadOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .default({ unreadOnly: false, limit: 30 });

export const markReadInput = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

export type NotificationListOutput = inferProcedureOutput<
  (typeof notificationRouter)["list"]
>;
export type NotificationItem = NotificationListOutput[number];
