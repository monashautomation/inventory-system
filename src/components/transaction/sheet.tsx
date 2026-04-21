import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MoveUpLeft, MoveUpRight } from "lucide-react";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

type GetItemRecordsOutput = inferProcedureOutput<
  AppRouter["itemRecord"]["get"]
>;

interface Props {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedRow: GetItemRecordsOutput;
}

const formatDate = (dateString?: Date | string | null) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  });
};

const formatCurrency = (
  cost: number | null | undefined,
  quantity: number | null | undefined,
) => {
  const value = (cost ?? 0) * (quantity ?? 1);
  return `$${value.toFixed(2)}`;
};

export default function TransactionDetailsSheet({
  isSidebarOpen,
  setIsSidebarOpen,
  selectedRow,
}: Props) {
  if (!selectedRow) return null;
  const isLoaned = !!selectedRow.loaned;

  return (
    <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
      <SheetContent className="sm:max-w-3xl p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>Transaction Details</SheetTitle>
            <SheetDescription>
              Detailed information about the selected transaction.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pb-4">
            <Card className="border-none shadow-none bg-background">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-neutral-50 mb-3">
                        Basic Information
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Date & Time
                          </p>
                          <p className="text-neutral-300">
                            {formatDate(selectedRow.createdAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Status
                          </p>
                          <div
                            className={`flex items-center gap-2 ${isLoaned ? "text-red-500" : "text-green-400"}`}
                          >
                            {isLoaned ? (
                              <MoveUpLeft size={18} />
                            ) : (
                              <MoveUpRight size={18} />
                            )}
                            <span className="font-medium">
                              {isLoaned ? "Loaned" : "Returned"}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Quantity
                          </p>
                          <p className="text-neutral-300">
                            {selectedRow.quantity ?? "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-50 mb-3">
                        Financial Details
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Value
                          </p>
                          <p className="text-neutral-300 font-mono text-lg">
                            {formatCurrency(
                              selectedRow.item?.cost,
                              selectedRow.quantity,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Right Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-neutral-50 mb-3">
                        Item Details
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Item Name
                          </p>
                          <p className="text-primary-700 font-medium">
                            {selectedRow.item?.name ?? "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            Location
                          </p>
                          <p className="">
                            {selectedRow.item?.location.name ?? "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-50 mb-3">
                        User Information
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                            User
                          </p>
                          <p className="text-neutral-300">
                            {selectedRow.actionBy?.name ?? "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-50 mb-3">
                        Notes
                      </h3>
                      <div className="p-3 bg-white rounded-md min-h-[120px]">
                        <p className="text-background whitespace-pre-wrap">
                          {selectedRow.notes ?? "No notes provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="p-6 border-t border-border">
            <Button onClick={() => setIsSidebarOpen(false)} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
