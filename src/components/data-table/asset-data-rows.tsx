import { useState, useMemo } from "react";
import { type Table, type Row, flexRender } from "@tanstack/react-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Pencil,
  Trash2,
} from "lucide-react";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";
import type React from "react";
import { Route, Routes } from "react-router-dom";
import ItemDetails from "@/pages/ItemDetails";

type Item = inferProcedureOutput<AppRouter["item"]["list"]>["items"][number];

export interface AssetActionProps {
  onAddToCart: (item: Item) => void;
  onModify: (item: Item) => void;
  onDelete: (item: Item) => void;
  itemInCart: (id: string) => boolean;
  getCartQuantity: (id: string) => number;
  isDeleting?: boolean;
  isAdmin?: boolean;
  callback?: () => void;
}

export interface AssetDataRowsProps extends AssetActionProps {
  table: Table<Item>;
}

type ItemRow = Row<Item>;

type RowGroup = {
  name: string;
  rows: ItemRow[];
};

function AssetChildRow({
  row,
  onAddToCart,
  onModify,
  onDelete,
  itemInCart,
  isDeleting,
  isAdmin,
  callback,
}: { row: ItemRow } & Omit<AssetActionProps, "getCartQuantity">) {
  const item = row.original;
  const records = item.ItemRecords;
  const latest = records
    ?.slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  const isLabUse = item.stored === false;
  const isOnLoan = latest?.loaned ?? false;
  const statusLabel = isLabUse
    ? "Lab Use"
    : isOnLoan
      ? "On Loan"
      : "In Storage";

  const inCart = itemInCart(item.id);

  let cartDisabled = false;
  let cartLabel = "Add to Cart";
  if (isLabUse) {
    cartDisabled = true;
    cartLabel = "In Use";
  } else if (isOnLoan) {
    cartDisabled = true;
    cartLabel = "Loaned";
  } else if (inCart) {
    cartDisabled = true;
    cartLabel = "In Cart";
  }

  return (
    <TableRow
      className="bg-muted/10"
      data-state={row.getIsSelected() && "selected"}
    >
      <TableCell>
        <div className="flex items-center">
          <label className="flex items-center cursor-pointer px-3 py-4">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              className="cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          </label>
        </div>
      </TableCell>

      {/* serial */}
      <TableCell className="pl-10 text-sm">{item.serial}</TableCell>

      {/* name — opens ItemDetails sheet */}
      <TableCell className="pl-10">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="link" className="p-0 h-auto">
              {item.name}
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
                        <ItemDetails passedId={item.id} callback={callback} />
                      }
                    />
                  </Routes>
                </div>
              </SheetHeader>
            </div>
          </SheetContent>
        </Sheet>
      </TableCell>

      {/* tags */}
      <TableCell className="pl-10">
        <div className="flex flex-col gap-1">
          {item.tags?.map(
            (tag) =>
              tag && (
                <Badge
                  key={tag.id}
                  style={{ "--color": tag.colour } as React.CSSProperties}
                  className="!bg-[#000000] text-white"
                >
                  {`${tag.name} ${tag.type}`}
                </Badge>
              ),
          )}
        </div>
      </TableCell>

      {/* location */}
      <TableCell className="pl-10 text-sm">
        {item.location?.name ?? "—"}
      </TableCell>

      {/* status */}
      <TableCell className="pl-10">
        <Badge
          variant={
            isLabUse ? "default" : isOnLoan ? "destructive" : "secondary"
          }
          className={isLabUse ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
        >
          {statusLabel}
        </Badge>
      </TableCell>

      {/* actions */}
      <TableCell className="pl-10">
        <div className="flex items-center justify-between gap-2 min-w-[200px]">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => onAddToCart(item)}
            disabled={cartDisabled}
            title={cartLabel}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {cartLabel}
          </Button>
          {isAdmin && (
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onModify(item)}
                title="Modify item"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDelete(item)}
                disabled={isDeleting}
                title="Delete item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface GroupRowProps extends AssetActionProps {
  group: RowGroup;
}

function GroupRow({
  group,
  onAddToCart,
  onModify,
  onDelete,
  itemInCart,
  isDeleting,
  isAdmin,
  callback,
}: GroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tagMap = new Map<string, NonNullable<Item["tags"]>[number]>();
  for (const row of group.rows) {
    for (const tag of row.original.tags ?? []) {
      if (tag && !tagMap.has(tag.id)) tagMap.set(tag.id, tag);
    }
  }
  const mergedTags = Array.from(tagMap.values());

  const locationNames = new Set(
    group.rows.map((r) => r.original.location?.name ?? null),
  );
  const locationDisplay =
    locationNames.size === 1
      ? (group.rows[0].original.location?.name ?? "—")
      : "Multiple Locations";

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setIsExpanded((v) => !v)}
      >
        {/* select */}
        <TableCell />

        {/* serial */}
        <TableCell>Multiple Serials</TableCell>

        {/* name */}
        <TableCell>
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Button variant="link" className="px-0 pointer-events-none">
              {group.name}
            </Button>
          </div>
        </TableCell>

        {/* tags */}
        <TableCell>
          <div className="flex flex-col gap-1">
            {mergedTags.map(
              (tag) =>
                tag && (
                  <Badge
                    key={tag.id}
                    style={{ "--color": tag.colour } as React.CSSProperties}
                    className="!bg-[#000000] text-white"
                  >
                    {`${tag.name} ${tag.type}`}
                  </Badge>
                ),
            )}
          </div>
        </TableCell>

        {/* location */}
        <TableCell>
          <Button variant="link" className="pointer-events-none">
            {locationDisplay}
          </Button>
        </TableCell>

        {/* status — empty for group row */}
        <TableCell />

        {/* actions — empty for group row */}
        <TableCell />
      </TableRow>

      {isExpanded &&
        group.rows.map((row) => (
          <AssetChildRow
            key={row.id}
            row={row}
            onAddToCart={onAddToCart}
            onModify={onModify}
            onDelete={onDelete}
            itemInCart={itemInCart}
            isDeleting={isDeleting}
            isAdmin={isAdmin}
            callback={callback}
          />
        ))}
    </>
  );
}

export function AssetDataRows({
  table,
  onAddToCart,
  onModify,
  onDelete,
  itemInCart,
  getCartQuantity,
  isDeleting,
  isAdmin,
  callback,
}: AssetDataRowsProps) {
  const rows = table.getRowModel().rows;
  const colCount = table.getVisibleFlatColumns().length;

  const groups = useMemo((): RowGroup[] => {
    const result: RowGroup[] = [];
    const seen = new Map<string, RowGroup>();
    for (const row of rows) {
      const name = row.original.name;
      if (!seen.has(name)) {
        const group: RowGroup = { name, rows: [] };
        result.push(group);
        seen.set(name, group);
      }
      seen.get(name)!.rows.push(row);
    }
    return result;
  }, [rows]);

  if (!rows.length) {
    return (
      <TableRow>
        <TableCell colSpan={colCount} className="text-center">
          No results.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {groups.map((group) => {
        if (group.rows.length === 1) {
          const row = group.rows[0];
          return (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          );
        }

        return (
          <GroupRow
            key={`group-${group.name}`}
            group={group}
            onAddToCart={onAddToCart}
            onModify={onModify}
            onDelete={onDelete}
            itemInCart={itemInCart}
            getCartQuantity={getCartQuantity}
            isDeleting={isDeleting}
            isAdmin={isAdmin}
            callback={callback}
          />
        );
      })}
    </>
  );
}
