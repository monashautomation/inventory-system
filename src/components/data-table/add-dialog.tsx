import { Plus } from "lucide-react";
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
import { useState } from "react";
import { AddAssetForm } from "@/components/item-crud/AddAssetForm";
import { AddConsumableForm } from "@/components/item-crud/AddConsumableForm";
import { trpc } from "@/client/trpc";
import z from "zod";
import { createItemInput } from "@/server/schema";
import { toast } from "sonner";

export function AddDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConsumable, setIsConsumable] = useState(false);

  const mut = trpc.item.create.useMutation({
    onError: (error) => {
      toast.error(error.message || "An error occurred", {
        description: error.data?.code ?? "Unknown error",
      });
    },
    onSuccess: () => {
      toast.success("Item added!");
    },
  });
  const createItem = (data: z.infer<typeof createItemInput>) => {
    mut.mutate(data);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
          <AddAssetForm createItem={createItem} />
        )}
      </DialogContent>
    </Dialog>
  );
}
