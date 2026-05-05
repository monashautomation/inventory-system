import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCartItemMaxQuantity, useCart } from "@/contexts/cart-context";
import { useEffect, useState } from "react";
import { NumberInput } from "./inputs/numeric-input";
import { toast } from "sonner";

type GetItemOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

export interface AddConsumableDialogProps {
  item: GetItemOutput;
  onClose: () => void;
}

export function AddConsumableDialog({
  item,
  onClose,
}: AddConsumableDialogProps) {
  const { addItem, getItem } = useCart();
  const currentQuantity = getItem(item?.id ?? "")?.quantity ?? 0;
  const availableToAdd = Math.max(
    getCartItemMaxQuantity(item) - currentQuantity,
    0,
  );
  const [itemQty, setItemQty] = useState(1);

  useEffect(() => {
    setItemQty(availableToAdd > 0 ? 1 : 0);
  }, [availableToAdd, item?.id]);

  if (!item) {
    return;
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add {item.name} to cart</DialogTitle>
        <DialogDescription>Please select quantity.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const added = addItem({ ...item, quantity: itemQty });
          if (added) {
            toast.success("Updated cart");
            onClose();
          }
        }}
      >
        <NumberInput
          min={1}
          max={availableToAdd > 0 ? availableToAdd : 1}
          value={itemQty}
          onValueChange={(number) => number && setItemQty(number)}
          placeholder="Qty"
          thousandSeparator=","
          className=""
          disabled={availableToAdd <= 0}
        />
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit" disabled={availableToAdd <= 0}>
            Add to Cart
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
