import { Plus, QrCode, X, Loader2 } from "lucide-react";
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
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [overrideSerial, setOverrideSerial] = useState<string | null>(null);
  const [serialInput, setSerialInput] = useState("");
  const [isCheckingSerial, setIsCheckingSerial] = useState(false);

  const utils = trpc.useUtils();

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
    mut.mutate({
      ...data,
      ...(overrideId ? { id: overrideId } : {}),
      ...(overrideSerial ? { serial: overrideSerial } : {}),
    });
    setIsOpen(false);
  };

  const handleQrScan = async (result: string) => {
    const segments = result.split("/");
    const itemId = segments[segments.length - 1];
    if (!itemId) return;
    setIsCheckingId(true);
    try {
      const existing = await utils.item.get.fetch({ id: itemId });
      if (existing) {
        toast.error("Item ID already exists", {
          description: `An item named "${existing.name}" already uses this ID.`,
        });
        return;
      }
      setOverrideId(itemId);
      setIdInput(itemId);
    } catch {
      setOverrideId(itemId);
      setIdInput(itemId);
    } finally {
      setIsCheckingId(false);
    }
  };

  const applyManualId = async () => {
    const trimmed = idInput.trim();
    if (!trimmed) return;
    setIsCheckingId(true);
    try {
      const existing = await utils.item.get.fetch({ id: trimmed });
      if (existing) {
        toast.error("Item ID already exists", {
          description: `An item named "${existing.name}" already uses this ID.`,
        });
        return;
      }
      setOverrideId(trimmed);
    } catch {
      setOverrideId(trimmed);
    } finally {
      setIsCheckingId(false);
    }
  };

  const clearOverrideId = () => {
    setOverrideId(null);
    setIdInput("");
  };

  const applySerial = async () => {
    const trimmed = serialInput.trim();
    if (!trimmed) return;
    setIsCheckingSerial(true);
    try {
      const existing = await utils.item.getBySerial.fetch({ serial: trimmed });
      if (existing) {
        toast.error("Serial number already exists", {
          description: `An item named "${existing.name}" already uses this serial.`,
        });
        return;
      }
      setOverrideSerial(trimmed);
    } catch {
      setOverrideSerial(trimmed);
    } finally {
      setIsCheckingSerial(false);
    }
  };

  const clearOverrideSerial = () => {
    setOverrideSerial(null);
    setSerialInput("");
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
                  disabled={!idInput.trim() || isCheckingId}
                >
                  {isCheckingId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Apply"
                  )}
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
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">
                Override Serial Number
              </Label>
              <p className="text-xs text-muted-foreground">
                Set a specific serial number for this item.
              </p>
              {overrideSerial ? (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="max-w-full truncate font-mono text-xs"
                  >
                    {overrideSerial}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={clearOverrideSerial}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter serial number..."
                    value={serialInput}
                    onChange={(e) => setSerialInput(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applySerial}
                    disabled={!serialInput.trim() || isCheckingSerial}
                  >
                    {isCheckingSerial ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              )}
            </div>
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
