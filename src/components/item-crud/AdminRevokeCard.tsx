import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserX } from "lucide-react";

interface AdminRevokeCardProps {
  itemId: string;
  targetUserId: string;
  onSuccess?: () => void;
}

export function AdminRevokeCard({
  itemId,
  targetUserId,
  onSuccess,
}: AdminRevokeCardProps) {
  const revokeMut = trpc.item.adminCheckinCart.useMutation({
    onSuccess: () => {
      toast.success("Item checked in successfully");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to check in item: ${error.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revoke Loan</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          size="lg"
          variant="destructive"
          disabled={revokeMut.isPending}
          onClick={() =>
            revokeMut.mutate({ targetUserId, cart: [{ itemId, quantity: 1 }] })
          }
        >
          <UserX className="h-4 w-4" />
          Check In Item
        </Button>
      </CardContent>
    </Card>
  );
}
