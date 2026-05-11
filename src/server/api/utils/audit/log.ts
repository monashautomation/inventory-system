import type { AuditAction } from "@prisma/client";
import type { ExtendedTransactionClient } from "../endpoint.utils";

interface WriteAuditLogArgs {
  action: AuditAction;
  actorId: string | null;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  tx: ExtendedTransactionClient,
  args: WriteAuditLogArgs,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: args.action,
      actorId: args.actorId,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before !== undefined ? (args.before as object) : undefined,
      after: args.after !== undefined ? (args.after as object) : undefined,
      metadata: args.metadata !== undefined ? (args.metadata as object) : undefined,
    },
  });
}
