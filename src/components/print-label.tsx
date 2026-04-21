import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "./inputs/numeric-input";
import { Printer } from "lucide-react";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";

interface PrintButtonProps {
  itemId: string;
}

const MAX_VALUE = 50;

export const PrintButton = ({ itemId }: PrintButtonProps) => {
  const [quantity, setQuantity] = useState(1);

  const labelMut = trpc.item.printLabel.useMutation({
    retry: 1,
    onSuccess: (data) => {
      if (data.ok) {
        toast.success("Label printed successfully!");
      } else {
        toast.error(data.error);
      }
    },
    onError: (error) => {
      toast.error(`Failed to print: ${error.message}`);
    },
  });

  const handlePrint = () => {
    labelMut.mutate({
      itemId: itemId,
      quantity: quantity,
    });
  };

  const isValidQuantity = quantity > 0 && !isNaN(quantity);

  return (
    <div className="flex flex-row items-center gap-4">
      <NumberInput
        className="w-20"
        value={quantity}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (val >= 1 || e.target.value === "") {
            setQuantity(val);
          }
          // Show toast if trying to enter value > MAX_VALUE
          if (val > MAX_VALUE) {
            toast.error(`Maximum quantity is ${MAX_VALUE}`);
          }
        }}
        onBlur={() => {
          if (quantity < 1 || isNaN(quantity)) {
            setQuantity(1);
            toast.error("Please enter a valid quantity");
          }
          if (quantity > MAX_VALUE) {
            toast.error(`Maximum quantity is ${MAX_VALUE}`);
            setQuantity(MAX_VALUE);
          }
        }}
        min={1}
      />
      <Button
        size="lg"
        onClick={handlePrint}
        disabled={
          labelMut.isPending || !isValidQuantity || quantity > MAX_VALUE
        }
      >
        <Printer />
        {labelMut.isPending ? "Printing..." : "Print"}
      </Button>
    </div>
  );
};
