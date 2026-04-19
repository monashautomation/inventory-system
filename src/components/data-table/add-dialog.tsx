import { Plus, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { AddAssetForm } from "@/components/item-crud/AddAssetForm";
import { AddConsumableForm } from "@/components/item-crud/AddConsumableForm";
import { QRScanner } from "@/components/ui/qr-scanner";
import { trpc } from "@/client/trpc";
import { authClient } from "@/auth/client";
import z from "zod";
import { createItemInput } from "@/server/schema";
import { toast } from "sonner";

export function AddDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConsumable, setIsConsumable] = useState(false);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [idInput, setIdInput] = useState("");

  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const mut = trpc.item.create.useMutation({
    onError: (error) => {
      toast.error(error.message || "An error occurred", {
        description: error.data?.code ?? "Unknown error",
      });
    },
    onSuccess: () => {
      toast.success("Item added!");
    },
  });

  const createItem = (data: z.infer<typeof createItemInput>) => {
    mut.mutate({ ...data, ...(overrideId ? { id: overrideId } : {}) });
    setIsOpen(false);
  };

  const handleQrScan = (result: string) => {
    const segments = result.split("/");
    const itemId = segments[segments.length - 1];
    if (itemId) {
      setOverrideId(itemId);
      setIdInput(itemId);
    }
  };

  const applyManualId = () => {
    const trimmed = idInput.trim();
    if (trimmed) {
      setOverrideId(trimmed);
    }
  };

  const clearOverrideId = () => {
    setOverrideId(null);
    setIdInput("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto h-8 lg:flex">
          <Plus />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an item</DialogTitle>
          <DialogDescription>Add an item to the system.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Switch
            checked={isConsumable}
            onCheckedChange={(value) => {
              setIsConsumable(value);
            }}
          />
          <Label htmlFor="isConsumable">Consumable</Label>
        </div>

        {isAdmin && (
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-sm font-medium">Override Item ID</Label>
            <p className="text-xs text-muted-foreground">
              Scan an existing label or enter an item ID to reuse it for this
              record.
            </p>
            {overrideId ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="max-w-full truncate font-mono text-xs"
                >
                  {overrideId}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={clearOverrideId}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter item ID..."
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyManualId}
                  disabled={!idInput.trim()}
                >
                  Apply
                </Button>
                <QRScanner
                  onScan={handleQrScan}
                  title="Scan Item Label"
                  description="Scan the QR code on an existing item label to use its ID."
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      <QrCode className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        )}

        {isConsumable ? (
          <AddConsumableForm createItem={createItem} />
        ) : (
          <AddAssetForm createItem={createItem} />
        )}
      </DialogContent>
    </Dialog>
  );
}
