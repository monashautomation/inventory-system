import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, ShoppingCart } from "lucide-react";
import type { Table } from "@tanstack/react-table";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { toast } from "sonner";
import { trpc } from "@/client/trpc";

interface BulkActionsProps<TData extends Omit<CartItem, "quantity">> {
  table: Table<TData>;
  onRefetch?: () => void;
}

export function BulkActions<TData extends Omit<CartItem, "quantity">>({
  table,
  onRefetch,
}: BulkActionsProps<TData>) {
  const { addItem, itemInCart, removeItem } = useCart();

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
    selectedData.forEach((item: TData) => {
      if (item && !itemInCart(item.id)) {
        const cartItem: CartItem = { ...item, quantity: 1 };
        addItem(cartItem);
      }
    });
    toast.success(
      `${selectedCount} item${selectedCount > 1 ? "s" : ""} added to cart.`,
    );
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

  // Check if all selected items are in cart
  const allInCart = selectedData.every((item: TData) => itemInCart(item.id));

  return (
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
          {allInCart ? (
            <DropdownMenuItem
              onClick={handleBulkRemoveFromCart}
              className="text-orange-600 hover:!text-orange-600 hover:!bg-orange-100"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Remove from Cart
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={handleBulkAddToCart}
              className="text-green-600 hover:!text-green-600 hover:!bg-green-100"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleBulkDelete}
            className="text-red-600 hover:!text-red-600 hover:!bg-red-100"
            disabled={bulkDeleteMut.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {bulkDeleteMut.isPending ? "Deleting..." : "Delete Selected"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
