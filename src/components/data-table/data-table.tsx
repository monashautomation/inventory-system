"use client";
import * as React from "react";
import type { ColumnDef, Table } from "@tanstack/react-table";
import {
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  type ColumnFiltersState,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table as TableRoot,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table/pagination";
import { DataRows } from "@/components/data-table/data-rows";
import { TableTopBar } from "@/components/data-table/table-top-bar";

export interface HasId {
  id: string;
}

interface DataTableProps<TData extends HasId, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[] | undefined;
  pageSize?: number;
  pageIndex?: number;
  filterKey: string;
  filterValue?: string;
  BarComponents: (table: any) => React.JSX.Element;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onFilterChange?: (filter: string) => void;
  totalCount?: number;
  renderRows?: (table: Table<TData>) => React.ReactNode;
}

export function DataTable<TData extends HasId, TValue>({
  columns,
  data,
  pageSize = 10,
  pageIndex = 0,
  filterKey,
  filterValue = "",
  BarComponents,
  onPageChange,
  onPageSizeChange,
  onFilterChange,
  totalCount,
  renderRows,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const [pagination, setPagination] = React.useState({
    pageIndex,
    pageSize,
  });

  React.useEffect(() => {
    setPagination({ pageIndex, pageSize });
  }, [pageIndex, pageSize]);

  const memoizedColumns = React.useMemo(() => columns, [columns]);

  const table = useReactTable({
    data: data ?? [],
    columns: memoizedColumns,
    pageCount: totalCount ? Math.ceil(totalCount / pagination.pageSize) : -1,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPagination(newPagination);
      onPageChange?.(newPagination.pageIndex);
      onPageSizeChange?.(newPagination.pageSize);
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    manualPagination: true,
  });

  return (
    <div>
      <TableTopBar
        table={table}
        filterKey={filterKey}
        filterValue={filterValue}
        onFilterChange={onFilterChange}
        BarComponents={BarComponents(table)}
      />
      <div className="rounded-md border">
        <TableRoot>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {renderRows ? (
              renderRows(table)
            ) : (
              <DataRows table={table} columns={columns} />
            )}
          </TableBody>
        </TableRoot>
      </div>
      <div className="mt-2">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
