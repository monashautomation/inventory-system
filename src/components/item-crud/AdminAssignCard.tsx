import { useState } from "react";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck } from "lucide-react";

interface AdminAssignCardProps {
  itemId: string;
  onSuccess?: () => void;
}

export function AdminAssignCard({ itemId, onSuccess }: AdminAssignCardProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: users, isLoading: usersLoading } = trpc.user.list.useQuery();

  const assignMut = trpc.item.adminCheckoutCart.useMutation({
    onSuccess: () => {
      toast.success("Item assigned successfully");
      setSelectedUserId("");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to assign item: ${error.message}`);
    },
  });

  const handleAssign = () => {
    if (!selectedUserId) return;
    assignMut.mutate({
      targetUserId: selectedUserId,
      cart: [{ itemId, quantity: 1 }],
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign to User</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Select
          value={selectedUserId}
          onValueChange={setSelectedUserId}
          disabled={usersLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a user..." />
          </SelectTrigger>
          <SelectContent>
            {users
              ?.slice()
              .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
              .map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                  <span className="ml-2 text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Button
          className="w-full"
          size="lg"
          disabled={!selectedUserId || assignMut.isPending}
          onClick={handleAssign}
        >
          <UserCheck className="h-4 w-4" />
          Assign Item
        </Button>
      </CardContent>
    </Card>
  );
}
