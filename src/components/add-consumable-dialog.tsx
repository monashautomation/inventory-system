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
import { useCart } from "@/contexts/cart-context";
import { useState } from "react";
import { NumberInput } from "./inputs/numeric-input";
import { toast } from "sonner";

type GetItemOutput = inferProcedureOutput<AppRouter["item"]["get"]>;

export interface AddConsumableDialogProps {
  item: GetItemOutput;
  onClose: () => void;
}

export function AddConsumableDialog({
  item,
  onClose,
}: AddConsumableDialogProps) {
  const { addItem, getItem } = useCart();
  const defaultqty = item && getItem(item.id)?.quantity;
  const [itemQty, setItemQty] = useState(defaultqty ?? 1);

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
          addItem({ ...item, quantity: itemQty });
          toast.success("Updated cart");
          onClose();
        }}
      >
        <NumberInput
          min={1}
          max={item.consumable?.available}
          value={itemQty}
          onValueChange={(number) => number && setItemQty(number)}
          placeholder="Qty"
          thousandSeparator=","
          className=""
        />
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit">Add/Update Cart</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
