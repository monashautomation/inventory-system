import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ModifyItemForm from "@/components/item-crud/ModifyItemForm";

type GetItemOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

interface ModifyFormProps {
  item: GetItemOutput;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function ModifyItemSheet({
  item,
  open,
  onOpenChange,
  onSuccess,
}: ModifyFormProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Modify {item?.name}</SheetTitle>
          <SheetDescription>
            Make changes to {item?.name}. Click save when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <ModifyItemForm
          item={item}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}
