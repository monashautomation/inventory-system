import { useCart, type CartItem } from "@/contexts/cart-context";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/inputs/numeric-input";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import type { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import type { CartForm } from "@/components/cart/cart-dialog";
import { ImageZoom } from "../ui/image-zoom";
import React, { useCallback, useState } from "react";
import { Skeleton } from "../ui/skeleton";

interface CartDialogItemProps {
  item: CartItem;
  form: UseFormReturn<CartForm>;
  index: number; // Prefer 'index' instead of 'key'
}

export const CartDialogItem = React.memo(
  ({ item, form, index }: CartDialogItemProps) => {
    const { updateQty, removeItem } = useCart();
    const [imageSrc, setImageSrc] = useState(item.image ?? "");
    const [isImgLoading, setIsImgLoading] = useState(true);
    const handleChangeQuantity = useCallback(
      (field: ControllerRenderProps<CartForm>) =>
        (value: number | undefined) => {
          const numericValue = typeof value === "number" ? value : 0;

          // Ensure input is valid before updating state
          if (!isNaN(numericValue)) {
            field.onChange(numericValue);
            updateQty(item.id, numericValue);
          }
        },
      [updateQty, item.id],
    );

    return (
      <div className="flex w-full min-h-10 items-center rounded-md justify-between gap-3 p-2 hover:bg-muted transition-colors">
        {/* Left Section - Image + Name */}
        <div className="flex gap-3 items-center flex-shrink-0">
          <div className="aspect-square h-12 border rounded-lg overflow-hidden">
            {item.image && (
              <>
                {isImgLoading && (
                  <Skeleton className="h-full w-full rounded-lg" />
                )}
                <ImageZoom>
                  <img
                    loading="lazy"
                    src={imageSrc}
                    alt={`${item.name} preview`}
                    className={`h-full w-full object-contain ${isImgLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
                    onLoad={() => setIsImgLoading(false)}
                    onError={() => {
                      setImageSrc("/path/to/fallback-image.jpg");
                      setIsImgLoading(false);
                    }}
                  />
                </ImageZoom>
              </>
            )}
          </div>
          <div className="flex flex-col text-left truncate">
            <span className="text-sm font-medium truncate">{item.name}</span>
            <span className="text-xs text-muted-foreground">{item.serial}</span>
          </div>
        </div>

        {/* Right Section - Controls */}
        <div className="flex items-center gap-3">
          {item.consumable && (
            <FormField
              control={form.control}
              name={`items.${index}.quantity`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <NumberInput
                      min={1}
                      max={item.consumable?.available}
                      value={item.quantity}
                      onValueChange={handleChangeQuantity(field)}
                      placeholder="Qty"
                      thousandSeparator=","
                      className="w-30"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-destructive/10"
            onClick={() => removeItem(item.id)}
          >
            <Trash2 className="text-destructive" size={18} />
          </Button>
        </div>
      </div>
    );
  },
);

CartDialogItem.displayName = "CartDialogItem";
