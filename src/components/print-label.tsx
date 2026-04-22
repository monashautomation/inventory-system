import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "./inputs/numeric-input";
import { Printer } from "lucide-react";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PrintButtonProps {
  itemId: string;
}

const MAX_VALUE = 50;
const LABEL_TYPES = [
  { value: 0, label: "Standard label" },
  { value: 1, label: "Small label" },
  { value: 2, label: "Cable label" },
] as const;

type LabelType = (typeof LABEL_TYPES)[number]["value"];

export const PrintButton = ({ itemId }: PrintButtonProps) => {
  const [quantity, setQuantity] = useState(1);
  const [labelType, setLabelType] = useState<LabelType>(0);

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
      labelType: labelType,
    });
  };

  const isValidQuantity = quantity > 0 && !isNaN(quantity);

  return (
    <div className="flex flex-col gap-3">
      <Select
        value={String(labelType)}
        onValueChange={(value) => setLabelType(Number(value) as LabelType)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Label type" />
        </SelectTrigger>
        <SelectContent>
          {LABEL_TYPES.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    </div>
  );
};
