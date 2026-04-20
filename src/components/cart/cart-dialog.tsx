import { ShoppingCart, Toilet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { useCart } from "@/contexts/cart-context";
import { CartDialogItem } from "@/components/cart/cart-item";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";

export const cartItemSchema = z.object({
  id: z.uuid(),
  quantity: z
    .number()
    .min(1, "Quantity must be at least 1")
    .int("Quantity must be a whole number"),
});

export const formSchema = z.object({
  items: z.array(cartItemSchema),
});

export type CartForm = z.infer<typeof formSchema>;

function getItemInvalidReason(
  item: ReturnType<typeof useCart>["items"][number],
): string | null {
  if (item.consumable) {
    if (item.quantity > (item.consumable.available ?? 0)) {
      return `Only ${item.consumable.available} available`;
    }
    return null;
  }

  if (item.stored === false) {
    return "Marked as Lab Use";
  }

  const latest = item.ItemRecords?.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  return latest?.loaned ? "Currently on loan" : null;
}

export default function CartDialog() {
  const { items, itemCount, checkout } = useCart();

  const form = useForm<CartForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      items: [],
    },
  });

  const invalidReasons = new Map<string, string>(
    items
      .map(
        (item) =>
          [item.id, getItemInvalidReason(item)] as [string, string | null],
      )
      .filter((entry): entry is [string, string] => entry[1] !== null),
  );
  const hasInvalidItems = invalidReasons.size > 0;

  const onSubmit = () => {
    if (hasInvalidItems) return;
    checkout();
  };

  const getFormIndex = (itemId: string) => {
    return items.findIndex((item) => item.id === itemId);
  };

  return (
    <div className="fixed bottom-10 right-12 z-[9999]">
      <Dialog>
        <DialogTrigger asChild>
          <div className="relative inline-block">
            <Button variant="default">
              <ShoppingCart />
              Cart
            </Button>

            {itemCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
              >
                {itemCount}
              </Badge>
            )}
          </div>
        </DialogTrigger>
        <Form {...form}>
          <form id="checkout-form" onSubmit={form.handleSubmit(onSubmit)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>My Cart</DialogTitle>
                {itemCount !== 0 && (
                  <DialogDescription>
                    Items will NOT be processed until checked out
                  </DialogDescription>
                )}
              </DialogHeader>

              {items.length !== 0 ? (
                <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                  {items.map((item) => {
                    const formIndex = getFormIndex(item.id);
                    return (
                      <CartDialogItem
                        key={item.id}
                        index={formIndex}
                        form={form}
                        item={item}
                        invalidReason={invalidReasons.get(item.id) ?? null}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center gap-4">
                  <Toilet size={128} className="opacity-10" />
                  <p className="text-gray-500 font-semibold">
                    No items in cart...
                  </p>
                </div>
              )}

              <DialogFooter className="flex-col items-end gap-2">
                {hasInvalidItems && (
                  <p className="text-xs text-destructive w-full text-right">
                    Remove or fix invalid items before checking out.
                  </p>
                )}
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    form="checkout-form"
                    disabled={hasInvalidItems || items.length === 0}
                  >
                    Checkout
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </form>
        </Form>
      </Dialog>
    </div>
  );
}
