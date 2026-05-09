import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageZoom } from "@/components/ui/image-zoom";
import { Checkbox } from "@/components/ui/checkbox";
import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "../ui/form";
import { NumberInput } from "../inputs/numeric-input";
import { Package } from "lucide-react";
import { Badge } from "../ui/badge";

type GetItemRecordType = inferProcedureOutput<AppRouter["itemRecord"]["get"]>;

interface CheckinItemProps {
  record: GetItemRecordType & { loanedQty: number };
  form: UseFormReturn<
    {
      items: {
        itemId: string;
        quantity: number;
      }[];
    },
    any,
    {
      items: {
        itemId: string;
        quantity: number;
      }[];
    }
  >;
}

export default function CheckinItem({ record, form }: CheckinItemProps) {
  const [imageSrc, setImageSrc] = useState(
    record?.item.image ? `/api/items/${record.itemId}/image` : "",
  );
  const [isImgLoading, setIsImgLoading] = useState(true);

  return (
    <FormField
      key={record?.id}
      control={form.control}
      name="items"
      render={({ field }) => {
        const currentRecord = field.value.find(
          (formRecord) => formRecord.itemId === record.itemId,
        );
        const isChecked = !!currentRecord;

        return (
          <FormItem>
            <div
              className={`group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md ${
                isChecked
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Checkbox */}
                <FormControl>
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        field.onChange([
                          ...field.value,
                          { itemId: record.itemId, quantity: 1 },
                        ]);
                      } else {
                        field.onChange(
                          field.value.filter(
                            (value) => value.itemId !== record.itemId,
                          ),
                        );
                      }
                    }}
                    className="h-5 w-5"
                  />
                </FormControl>

                {/* Image */}
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-muted">
                  {record?.item.image ? (
                    <>
                      {isImgLoading && (
                        <Skeleton className="absolute inset-0" />
                      )}
                      <ImageZoom>
                        <img
                          loading="lazy"
                          src={imageSrc}
                          alt={`${record.item.name} preview`}
                          className={`h-full w-full object-cover transition-opacity ${
                            isImgLoading ? "opacity-0" : "opacity-100"
                          }`}
                          onLoad={() => setIsImgLoading(false)}
                          onError={() => {
                            setImageSrc("");
                            setIsImgLoading(false);
                          }}
                        />
                      </ImageZoom>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="truncate font-semibold text-foreground">
                    {record?.item.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Serial: {record?.item.serial}
                  </p>
                  <Badge variant="secondary" className="w-fit text-xs">
                    Loaned: {record?.loanedQty}
                  </Badge>
                </div>

                {/* Quantity Input */}
                {isChecked && (
                  <div className="flex flex-col items-end gap-2">
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      Return Qty
                    </FormLabel>
                    <NumberInput
                      min={1}
                      max={record.loanedQty}
                      value={currentRecord?.quantity ?? 1}
                      onValueChange={(value) => {
                        const updatedItems = field.value.map((item) =>
                          item.itemId === record.itemId
                            ? { ...item, quantity: Number(value) || 1 }
                            : item,
                        );
                        field.onChange(updatedItems);
                      }}
                      thousandSeparator=","
                      className="w-30"
                    />
                  </div>
                )}
              </div>
            </div>
          </FormItem>
        );
      }}
    />
  );
}
