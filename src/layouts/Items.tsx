import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge } from "@/components/data-table/item-status-badge";
import { ItemRowActions } from "@/components/data-table/item-row-actions";
import { getLoanState } from "@/lib/loan";
import type React from "react";
import { Route, Routes } from "react-router-dom";
import ItemDetails from "@/pages/ItemDetails";

type GetItemsOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

interface ItemProps {
  consumable: boolean;
  onAddToCart: (item: GetItemsOutput) => void;
  onModify: (item: GetItemsOutput) => void;
  onDelete: (item: GetItemsOutput) => void;
  itemInCart: (id: string) => boolean;
  getCartQuantity: (id: string) => number;
  isDeleting?: boolean;
  callback?: () => void;
  isAdmin?: boolean;
  currentUserId?: string;
  disableFieldSorting?: boolean;
}

function Items({
  consumable,
  onAddToCart,
  onModify,
  onDelete,
  itemInCart,
  isDeleting,
  callback,
  isAdmin,
  currentUserId,
  disableFieldSorting = false,
}: ItemProps) {
  const columns: ColumnDef<GetItemsOutput>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center">
          <label className="flex items-center cursor-pointer px-3 py-4">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label="Select all"
              className="cursor-pointer"
            />
          </label>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center">
          <label className="flex items-center cursor-pointer px-3 py-4">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              className="cursor-pointer"
            />
          </label>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "serial",
      enableSorting: !disableFieldSorting,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Serial" />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        return (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="link" className="font-semibold text-foreground">
                {row.getValue("name")}
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-3xl p-0 overflow-hidden">
              <div className="flex flex-col h-full max-h-screen">
                <SheetHeader className="px-6 pt-6 pb-4 flex-shrink-0">
                  <SheetTitle>Item Details</SheetTitle>
                  <SheetDescription>
                    Detailed information about the selected item.
                  </SheetDescription>
                  <div className="flex-1 overflow-y-auto pb-4 min-h-0">
                    <Routes>
                      <Route
                        path="*"
                        element={
                          <ItemDetails
                            passedId={row.original?.id}
                            callback={callback}
                          />
                        }
                      />
                    </Routes>
                  </div>
                </SheetHeader>
              </div>
            </SheetContent>
          </Sheet>
        );
      },
    },
    {
      accessorKey: "tag",
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tag" />
      ),
      cell: ({ row }) => {
        return (
          <div className="flex flex-col gap-1">
            {row.original?.tags?.map(
              (tag) =>
                tag && (
                  <Badge
                    key={row.original?.id + tag.id}
                    style={
                      {
                        "--color": tag.colour,
                      } as React.CSSProperties
                    }
                    className="!bg-[#000000] text-white"
                  >
                    {`${tag.name} ${tag.type}`}
                  </Badge>
                ),
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "location",
      accessorFn: (row) => row?.location?.name,
      enableSorting: !disableFieldSorting,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Storage Location" />
      ),
      cell: ({ row }) => {
        return (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="link" className="text-foreground">
                {row.getValue("location")}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>More about this location</SheetTitle>
                <SheetDescription>
                  This feature is not implemented yet.
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        );
      },
    },
    consumable
      ? {
          accessorKey: "available",
          accessorFn: (row) => row?.consumable?.available,
          header: () => "Available",
          cell: ({ row }) => {
            return (
              <HoverCard>
                <HoverCardTrigger>
                  <div className="items-center flex justify-items-center">
                    {row.getValue("available")}
                  </div>
                </HoverCardTrigger>
                <HoverCardContent>{"Not Signed Out"}</HoverCardContent>
              </HoverCard>
            );
          },
        }
      : {
          id: "status",
          header: () => "Status",
          cell: ({ row }) => {
            const { state, heldByMe } = getLoanState(
              row.original,
              currentUserId,
            );
            return <ItemStatusBadge state={state} heldByMe={heldByMe} />;
          },
        },
    {
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;
        const { state, heldByMe } = getLoanState(item, currentUserId);
        return (
          <ItemRowActions
            consumable={consumable}
            loanState={state}
            heldByMe={heldByMe}
            inCart={itemInCart(item.id)}
            isAdmin={isAdmin}
            isDeleting={isDeleting}
            onAddToCart={() => onAddToCart(item)}
            onModify={() => onModify(item)}
            onDelete={() => onDelete(item)}
          />
        );
      },
    },
  ];

  return columns;
}

export default Items;
