import { Plus, X, Loader2, ChevronDown } from "lucide-react";
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
import { trpc } from "@/client/trpc";
import { authClient } from "@/auth/client";
import z from "zod";
import { createItemInput } from "@/server/schema";
import { toast } from "sonner";

interface AddDialogProps {
  defaultConsumable?: boolean;
}

export function AddDialog({ defaultConsumable = false }: AddDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConsumable, setIsConsumable] = useState(defaultConsumable);
  const [serialExpanded, setSerialExpanded] = useState(false);
  const [overrideSerial, setOverrideSerial] = useState<string | null>(null);
  const [serialInput, setSerialInput] = useState("");
  const [isCheckingSerial, setIsCheckingSerial] = useState(false);
  const [assetQuantity, setAssetQuantity] = useState(1);

  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";
  const utils = trpc.useUtils();

  const mut = trpc.item.create.useMutation({
    onError: (error) => {
      toast.error(error.message || "An error occurred", {
        description: error.data?.code ?? "Unknown error",
      });
    },
    onSuccess: () => {
      void utils.item.list.invalidate();
      void utils.item.listForAssets.invalidate();
    },
  });

  const createItem = async (
    data: z.infer<typeof createItemInput>,
    quantity = 1,
  ) => {
    setIsOpen(false);
    for (let i = 0; i < quantity; i++) {
      await mut.mutateAsync({
        ...data,
        ...(quantity === 1 && overrideSerial ? { serial: overrideSerial } : {}),
      });
    }
    toast.success(quantity > 1 ? `${quantity} assets added!` : "Item added!");
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

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAssetQuantity(1);
      setOverrideSerial(null);
      setSerialInput("");
      setSerialExpanded(false);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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

        {isConsumable ? (
          <AddConsumableForm createItem={createItem} />
        ) : (
          <AddAssetForm
            createItem={createItem}
            onQuantityChange={setAssetQuantity}
          />
        )}

        {isAdmin && !isConsumable && assetQuantity === 1 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setSerialExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${serialExpanded ? "rotate-180" : ""}`}
              />
              Advanced
            </button>
            {serialExpanded && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Override serial number
                </Label>
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
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
