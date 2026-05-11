import type { NotificationType, RequestStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "../endpoint.utils";

interface EmitArgs {
  request: {
    id: string;
    requestedById: string;
    quantity: number;
    fulfilledQty?: number | null;
  };
  newStatus: RequestStatus;
  itemName: string;
  actorId: string;
}

const notificationMap: Partial<
  Record<
    RequestStatus,
    {
      type: NotificationType;
      title: (name: string) => string;
      body?: (args: EmitArgs) => string;
    }
  >
> = {
  ORDERED: {
    type: "REQUEST_ORDERED",
    title: (name) => `Order placed: ${name}`,
  },
  RECEIVED: {
    type: "REQUEST_RECEIVED",
    title: (name) => `Received: ${name}`,
    body: ({ request }) => {
      const fulfilled = request.fulfilledQty ?? request.quantity;
      if (fulfilled !== request.quantity) {
        return `${fulfilled} of ${request.quantity} units received.`;
      }
      return `All ${request.quantity} units received.`;
    },
  },
  CANCELLED: {
    type: "REQUEST_CANCELLED",
    title: (name) => `Request cancelled: ${name}`,
  },
};

export async function emitRequestStatusNotification(
  tx: ExtendedTransactionClient,
  args: EmitArgs,
): Promise<void> {
  // Don't notify if the actor is the requester (self-action)
  if (args.actorId === args.request.requestedById) return;

  const entry = notificationMap[args.newStatus];
  if (!entry) return;

  await tx.notification.create({
    data: {
      userId: args.request.requestedById,
      type: entry.type,
      title: entry.title(args.itemName),
      body: entry.body ? entry.body(args) : null,
      entityType: "ConsumableRequest",
      entityId: args.request.id,
    },
  });
}
