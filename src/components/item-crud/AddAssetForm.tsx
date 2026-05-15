import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { NumberInput } from "../inputs/numeric-input";
import { useCallback, useState } from "react";
import { CascadingLocation } from "./CascadingLocation";
import { createItemInput } from "@/server/schema";

interface AddAssetFormProps {
  createItem: (
    data: z.infer<typeof createItemInput>,
    quantity: number,
  ) => void | Promise<void>;
  onQuantityChange?: (quantity: number) => void;
}

export function AddAssetForm({
  createItem,
  onQuantityChange,
}: AddAssetFormProps) {
  const [quantity, setQuantity] = useState(1);

  const form = useForm<z.infer<typeof createItemInput>>({
    resolver: zodResolver(createItemInput),
    defaultValues: {
      name: "",
      cost: 0,
      locationId: "",
      tags: [],
    },
  });

  function onAssetSumbit(values: z.infer<typeof createItemInput>) {
    void createItem(values, quantity);
  }

  const handleLocationSelect = useCallback(
    (locationId: string | null) => {
      if (locationId) {
        form.setValue("locationId", locationId ?? "", {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    },
    [form],
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onAssetSumbit)}
        className="flex flex-col gap-5"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Asset name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Location</FormLabel>
          <CascadingLocation onLocationSelect={handleLocationSelect} />
          {form.formState.errors.locationId && (
            <p className="text-sm font-medium text-destructive">
              {form.formState.errors.locationId.message}
            </p>
          )}
        </FormItem>

        <FormField
          control={form.control}
          name="cost"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost</FormLabel>
              <FormControl>
                <NumberInput
                  min={1}
                  value={field.value}
                  onValueChange={field.onChange}
                  thousandSeparator=","
                  className=""
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Quantity</FormLabel>
          <FormControl>
            <NumberInput
              min={1}
              max={100}
              value={quantity}
              onValueChange={(v) => {
                const next = v ?? 1;
                setQuantity(next);
                onQuantityChange?.(next);
              }}
              className=""
            />
          </FormControl>
          <p className="text-xs text-muted-foreground">
            {quantity > 1
              ? `Creates ${quantity} identical assets with unique IDs and serials`
              : "Creates 1 asset"}
          </p>
        </FormItem>

        <Button type="submit">
          {quantity > 1 ? `Add ${quantity} Assets` : "Add Asset"}
        </Button>
      </form>
    </Form>
  );
}
