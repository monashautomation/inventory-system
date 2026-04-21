"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/client/trpc";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";
import Loading from "@/components/misc/loading";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { MoveUpLeft, MoveUpRight } from "lucide-react";
import TransactionDetailsSheet from "@/components/transaction/sheet";
import ErrorPage from "./Error";
import { keepPreviousData } from "@tanstack/react-query";

// Usage example
export default function Transactions() {
  type GetItemRecordsOutput = inferProcedureOutput<
    AppRouter["itemRecord"]["list"]
  >["transactions"][number];

  // State for selected row and sidebar
  const [selectedRow, setSelectedRow] = useState<GetItemRecordsOutput | null>(
    null,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Manage pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Define the shape of your data
  const { data, isLoading, error } = trpc.itemRecord.list.useQuery(
    {
      page: pageIndex,
      pageSize,
    },
    {
      placeholderData: keepPreviousData,
      staleTime: 1000,
    },
  );
  console.log(data);

  // Define columns
  const columns: ColumnDef<GetItemRecordsOutput, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date & Time" />
      ),
      cell: ({ row }) => {
        if (row.original?.createdAt) {
          const date = new Date(row.original?.createdAt);
          const formattedShort = date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            year: "numeric",
          });
          const formattedFull = date.toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: true,
          });
          return (
            <div
              className="relative group cursor-pointer hover:underline hover:text-primary-900 transition p-2 rounded"
              onClick={() => handleRowClick(row.original)}
            >
              <span className="text-sm text-neutral-400">{formattedShort}</span>
              <div className="absolute z-10 invisible group-hover:visible bg-neutral-800 text-white text-xs rounded py-1 px-2 -mt-8">
                {formattedFull}
              </div>
            </div>
          );
        } else {
          return <div className="flex justify-center">-</div>;
        }
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => handleRowClick(row.original)}
          className={`flex flex-row gap-2 ${
            row.original?.loaned ? "text-red-500" : "text-green-400"
          } cursor-pointer  hover:underline transition p-2 rounded`}
        >
          {row.original?.loaned ? (
            <MoveUpLeft size={18} />
          ) : (
            <MoveUpRight size={18} />
          )}
          {row.original?.loaned ? "Loaned" : "Returned"}
        </span>
      ),
    },
    {
      accessorKey: "item",
      accessorFn: (row) => row?.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Item" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => handleRowClick(row.original)}
          className="font-medium text-primary-700 cursor-pointer  hover:underline transition p-2 rounded"
        >
          {row.getValue("item")}
        </span>
      ),
    },
    {
      accessorKey: "name",
      accessorFn: (row) => row?.actionBy.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => handleRowClick(row.original)}
          className="cursor-pointer  hover:underline transition p-2 rounded"
        >
          {row.getValue("name")}
        </span>
      ),
    },
    {
      accessorKey: "location",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Location" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => handleRowClick(row.original)}
          className=" cursor-pointer  hover:underline transition p-2 rounded"
        >
          {row.original?.item.location.name}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Qty" />
      ),
    },
    {
      accessorKey: "value",
      accessorFn: (row: GetItemRecordsOutput) =>
        ((row?.item.cost ?? 0) * (row?.quantity ?? 1)).toFixed(2),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Value" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">${row.getValue("value")}</span>
      ),
    },
    {
      accessorKey: "notes",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Notes" />
      ),
      cell: ({ row }) => {
        const notes = row.original?.notes ?? "-";
        return (
          <div
            onClick={() => handleRowClick(row.original)}
            className="flex flex-col gap-1 cursor-pointer  hover:underline transition p-2 rounded"
          >
            <span className="text-neutral-400 truncate max-w-44">{notes}</span>
          </div>
        );
      },
    },
  ];

  // Handle row click
  const handleRowClick = (row: GetItemRecordsOutput) => {
    setSelectedRow(row);
    setIsSidebarOpen(true);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-12 px-4">
        <div className="flex justify-center items-center h-64">
          <Loading />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return <ErrorPage message={error.message} />;
  }

  return (
    <div className="min-h-screen bg-background py-3 p-6 md:p-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-left">Transactions</h1>
        <p className="text-muted-foreground">View your transaction history</p>
      </div>

      <div className="shadow-lg rounded-lg overflow-hidden">
        <DataTable
          data={data?.transactions ?? []}
          columns={columns}
          pageIndex={pageIndex}
          pageSize={pageSize}
          onPageChange={setPageIndex}
          onPageSizeChange={setPageSize}
          totalCount={data?.totalCount}
          filterKey="name"
          BarComponents={() => (
            <div className="flex justify-center items-center mr-2">
              <div className="text-sm text-neutral-500 text-center">
                {data?.totalCount}{" "}
                {data?.totalCount === 1 ? "transaction" : "transactions"} found
              </div>
            </div>
          )}
        />
      </div>
      <TransactionDetailsSheet
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        selectedRow={selectedRow}
      />
    </div>
  );
}
