import type { Table } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "@/components/data-table/column-toggle";
import type React from "react";
import { useDeferredValue, useEffect, useState } from "react";

export function TableTopBar<TData>({
  table,
  filterKey,
  filterValue,
  onFilterChange,
  BarComponents,
}: {
  table: Table<TData>;
  filterKey: string;
  filterValue?: string;
  onFilterChange?: (filter: string) => void;
  BarComponents: React.JSX.Element;
}) {
  const [localFilter, setLocalFilter] = useState(filterValue ?? "");
  const deferredFilter = useDeferredValue(localFilter);

  // Sync external filterValue changes to local state
  useEffect(() => {
    if (filterValue !== undefined) {
      setLocalFilter(filterValue);
    }
  }, [filterValue]);

  // Call the parent callback when the deferred filter changes
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange(deferredFilter);
    } else {
      // Fallback to client-side filtering if no callback provided
      table.getColumn(filterKey)?.setFilterValue(deferredFilter);
    }
  }, [deferredFilter, onFilterChange, table, filterKey]);

  return (
    <div className="flex justify-between items-center py-4">
      <Input
        placeholder="Search..."
        value={localFilter}
        onChange={(event) => setLocalFilter(event.target.value)}
        className="max-w-sm"
      />
      <div className="flex gap-2">
        {BarComponents}

        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
