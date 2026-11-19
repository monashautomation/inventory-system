import type { AppRouter } from "@/server/api/routers/_app";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferProcedureOutput } from "@trpc/server";
import { useForm } from "react-hook-form";
import z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "../ui/form";
import { NumberInput } from "../inputs/numeric-input";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";

type GetItemType = inferProcedureOutput<AppRouter["item"]["get"]>;

interface RestockFormProps {
  item: GetItemType;
  callback?: () => void;
}

const restockFormSchema = z.object({
  itemId: z.string().nonempty(),
  quantity: z.number().nonnegative().default(1).nonoptional(),
});

export default function RestockForm({ item, callback }: RestockFormProps) {
  const restockMut = trpc.consumable.restock.useMutation({
    onSuccess: () => {
      toast.success("Item restocked successfully");
      callback?.();
    },
    onError: (error) => {
      toast.error(`Failed to restock item: ${error.message}`);
    },
  });

  const form = useForm<z.infer<typeof restockFormSchema>>({
    resolver: zodResolver(restockFormSchema),
    defaultValues: {
      itemId: item?.id,
      quantity: 1,
    },
  });

  const onSubmit = (values: z.infer<typeof restockFormSchema>) => {
    restockMut.mutate([values]);
  };

  if (!item?.consumable) {
    return;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
      >
        <FormField
          key={item?.id}
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Add</FormLabel>
              <FormControl>
                <NumberInput
                  min={1}
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                />
              </FormControl>
              <FormDescription>
                New total: {item?.consumable!.available + (field.value || 0)}
              </FormDescription>
            </FormItem>
          )}
        />

        <Button type="submit" variant="outline" className="w-full" size="lg">
          <Plus className="h-4 w-4" />
          Add to Stock
        </Button>
      </form>
    </Form>
  );
}
