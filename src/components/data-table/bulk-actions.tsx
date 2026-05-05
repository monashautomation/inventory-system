import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Trash2, ShoppingCart, Printer } from "lucide-react";
import type { Table } from "@tanstack/react-table";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { toast } from "sonner";
import { trpc } from "@/client/trpc";
import { authClient } from "@/auth/client";

const LABEL_TYPES = [
  { value: 0, label: "Standard label" },
  { value: 1, label: "Small label" },
  { value: 2, label: "Cable label" },
] as const;

type LabelType = (typeof LABEL_TYPES)[number]["value"];

interface BulkActionsProps<TData extends Omit<CartItem, "quantity">> {
  table: Table<TData>;
  onRefetch?: () => void;
}

export function BulkActions<TData extends Omit<CartItem, "quantity">>({
  table,
  onRefetch,
}: BulkActionsProps<TData>) {
  const { addItem, itemInCart, removeItem } = useCart();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printLabelType, setPrintLabelType] = useState<LabelType>(0);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  const printLabelMut = trpc.item.printLabel.useMutation();

  const bulkDeleteMut = trpc.item.bulkDelete.useMutation({
    onError: (error) => {
      toast.error(`Failed to delete items: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Items deleted successfully.");
      table.resetRowSelection();
      onRefetch?.();
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const selectedData = selectedRows.map((row) => row.original);

  // Don't render if no rows are selected
  if (selectedCount === 0) {
    return null;
  }

  const handleBulkAddToCart = () => {
    let addedCount = 0;

    selectedData.forEach((item: TData) => {
      if (!item) {
        return;
      }

      if (!item.consumable && itemInCart(item.id)) {
        return;
      }

      const cartItem: CartItem = { ...item, quantity: 1 };
      if (addItem(cartItem)) {
        addedCount += 1;
      }
    });

    if (addedCount > 0) {
      toast.success(
        `${addedCount} item${addedCount > 1 ? "s" : ""} added to cart.`,
      );
    }
    table.resetRowSelection();
  };

  const handleBulkRemoveFromCart = () => {
    selectedData.forEach((item: TData) => {
      if (item && itemInCart(item.id)) {
        removeItem(item.id);
      }
    });
    toast.success(
      `${selectedCount} item${selectedCount > 1 ? "s" : ""} removed from cart.`,
    );
    table.resetRowSelection();
  };

  const handleBulkDelete = () => {
    const itemIds = selectedData.map((item: TData) => item.id).filter(Boolean);
    if (itemIds.length > 0) {
      bulkDeleteMut.mutate({ ids: itemIds });
    }
  };

  const handleBulkPrint = async () => {
    setIsPrinting(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of selectedData) {
      try {
        const result = await printLabelMut.mutateAsync({
          itemId: item.id,
          quantity: printQuantity,
          labelType: printLabelType,
        });
        if (result.ok) {
          successCount += 1;
        } else {
          failCount += 1;
        }
      } catch {
        failCount += 1;
      }
    }

    setIsPrinting(false);
    setPrintDialogOpen(false);

    if (successCount > 0) {
      toast.success(
        `Printed labels for ${successCount} item${successCount > 1 ? "s" : ""}.`,
      );
    }
    if (failCount > 0) {
      toast.error(
        `Failed to print labels for ${failCount} item${failCount > 1 ? "s" : ""}.`,
      );
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4 mr-2" />
              Bulk Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleBulkAddToCart}
              className="text-green-600 hover:!text-green-600 hover:!bg-green-100"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPrintDialogOpen(true)}>
              <Printer className="h-4 w-4 mr-2" />
              Print Labels
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleBulkDelete}
                  className="text-red-600 hover:!text-red-600 hover:!bg-red-100"
                  disabled={bulkDeleteMut.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {bulkDeleteMut.isPending ? "Deleting..." : "Delete Selected"}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleBulkRemoveFromCart}
              className="text-orange-600 hover:!text-orange-600 hover:!bg-orange-100"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Remove from Cart
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Print Labels</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Printing labels for {selectedCount} item
              {selectedCount > 1 ? "s" : ""}.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="label-type">Label size</Label>
              <Select
                value={String(printLabelType)}
                onValueChange={(v) => setPrintLabelType(Number(v) as LabelType)}
              >
                <SelectTrigger id="label-type">
                  <SelectValue placeholder="Select label size" />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="label-qty">Quantity per item</Label>
              <Input
                id="label-qty"
                type="number"
                min={1}
                max={50}
                value={printQuantity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= 50) setPrintQuantity(val);
                }}
                className="w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPrintDialogOpen(false)}
              disabled={isPrinting}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkPrint} disabled={isPrinting}>
              <Printer className="h-4 w-4 mr-2" />
              {isPrinting ? "Printing..." : "Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
