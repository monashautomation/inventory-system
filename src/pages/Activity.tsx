"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/client/trpc";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";
import Loading from "@/components/misc/loading";
import { UserAvatar } from "@/components/user/UserAvatar";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { MoveUpLeft, MoveUpRight, Flame, ScrollText } from "lucide-react";
import TransactionDetailsSheet from "@/components/transaction/sheet";
import ErrorPage from "./Error";
import { keepPreviousData } from "@tanstack/react-query";
import { authClient } from "@/auth/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AuditActionType } from "@/server/schema/auditLog.schema";

type TransactionRow = inferProcedureOutput<
  AppRouter["itemRecord"]["list"]
>["transactions"][number];

type AuditRow = inferProcedureOutput<
  AppRouter["auditLog"]["list"]
>["items"][number];

const ACTION_LABELS: Record<
  AuditActionType,
  { label: string; className: string }
> = {
  REQUEST_CREATED: {
    label: "Created",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  REQUEST_STATUS_CHANGED: {
    label: "Status changed",
    className: "bg-muted text-muted-foreground",
  },
  REQUEST_CANCELLED: {
    label: "Cancelled",
    className: "bg-destructive/15 text-destructive",
  },
  REQUEST_RECEIVED: {
    label: "Received",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
};

const ALL_ACTIONS: AuditActionType[] = [
  "REQUEST_CREATED",
  "REQUEST_STATUS_CHANGED",
  "REQUEST_CANCELLED",
  "REQUEST_RECEIVED",
];

function DiffCell({ before, after }: { before: unknown; after: unknown }) {
  if (!before && !after)
    return <span className="text-muted-foreground">—</span>;

  const renderObj = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return null;
    return Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => (
        <span key={k} className="block text-xs">
          <span className="text-muted-foreground">{k}:</span>{" "}
          <span>{String(v)}</span>
        </span>
      ));
  };

  return (
    <div className="flex gap-3 text-xs">
      {before != null && (
        <div className="rounded bg-destructive/5 px-1.5 py-1 min-w-[80px]">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
            before
          </span>
          {renderObj(before)}
        </div>
      )}
      {after != null && (
        <div className="rounded bg-emerald-500/5 px-1.5 py-1 min-w-[80px]">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
            after
          </span>
          {renderObj(after)}
        </div>
      )}
    </div>
  );
}

function AuditExpandableRow({ row }: { row: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const ts = new Date(row.createdAt);
  const dateStr = ts.toLocaleDateString();
  const timeStr = ts.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const actionMeta = ACTION_LABELS[row.action as AuditActionType] ?? {
    label: row.action,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          <span className="block">{dateStr}</span>
          <span className="block">{timeStr}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {row.actor ? (
              <UserAvatar
                name={row.actor.name}
                image={row.actor.image}
                size="sm"
              />
            ) : null}
            <div>
              <span className="text-sm">{row.actor?.name ?? "System"}</span>
              {row.actor?.email && (
                <span className="block text-xs text-muted-foreground">
                  {row.actor.email}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge className={cn("text-xs", actionMeta.className)}>
            {actionMeta.label}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.entityType}/{row.entityId.slice(0, 8)}…
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {expanded ? "▲ Hide" : "▼ Show"}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/20 py-3 px-4">
            <DiffCell before={row.before} after={row.after} />
            {row.metadata &&
              typeof row.metadata === "object" &&
              Object.keys(row.metadata).length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="font-semibold">Metadata: </span>
                  {JSON.stringify(row.metadata)}
                </div>
              )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function TransactionsTab() {
  const [selectedRow, setSelectedRow] = useState<TransactionRow | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const openRow = (row: TransactionRow) => {
    setSelectedRow(row);
    setIsSidebarOpen(true);
  };

  const { data, isLoading, error } = trpc.itemRecord.list.useQuery(
    { page: pageIndex, pageSize },
    { placeholderData: keepPreviousData, staleTime: 1000 },
  );

  const columns: ColumnDef<TransactionRow, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date & Time" />
      ),
      cell: ({ row }) => {
        if (!row.original?.createdAt)
          return <div className="flex justify-center">-</div>;
        const date = new Date(row.original.createdAt);
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
            onClick={() => openRow(row.original)}
          >
            <span className="text-sm text-neutral-400">{formattedShort}</span>
            <div className="absolute z-10 invisible group-hover:visible bg-neutral-800 text-white text-xs rounded py-1 px-2 -mt-8">
              {formattedFull}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const { loaned } = row.original ?? {};
        const isConsumable = row.original?.item?.consumable != null;
        const isConsumed = !loaned && isConsumable;
        const label = loaned ? "Loaned" : isConsumed ? "Consumed" : "Returned";
        const color = loaned
          ? "text-red-500"
          : isConsumed
            ? "text-orange-400"
            : "text-green-400";
        const Icon = loaned ? MoveUpLeft : isConsumed ? Flame : MoveUpRight;
        return (
          <span
            onClick={() => openRow(row.original)}
            className={`flex flex-row gap-2 ${color} cursor-pointer hover:underline transition p-2 rounded`}
          >
            <Icon size={18} />
            {label}
          </span>
        );
      },
    },
    {
      accessorKey: "item",
      accessorFn: (row) => row?.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Item" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => openRow(row.original)}
          className="font-medium text-primary-700 cursor-pointer hover:underline transition p-2 rounded"
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
      cell: ({ row }) => {
        const actionBy = row.original?.actionBy;
        const performedBy = row.original?.performedBy;
        return (
          <div
            onClick={() => openRow(row.original)}
            className="cursor-pointer hover:underline transition p-2 rounded flex items-center gap-2"
          >
            <UserAvatar
              name={actionBy?.name}
              image={actionBy?.image}
              size="sm"
            />
            <div className="flex flex-col">
              <span>{row.getValue("name")}</span>
              {performedBy && (
                <span className="text-xs text-muted-foreground">
                  via {performedBy.name}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "location",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Location" />
      ),
      cell: ({ row }) => (
        <span
          onClick={() => openRow(row.original)}
          className="cursor-pointer hover:underline transition p-2 rounded"
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
      accessorFn: (row: TransactionRow) =>
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
      cell: ({ row }) => (
        <div
          onClick={() => openRow(row.original)}
          className="flex flex-col gap-1 cursor-pointer hover:underline transition p-2 rounded"
        >
          <span className="text-neutral-400 truncate max-w-44">
            {row.original?.notes ?? "-"}
          </span>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loading />
      </div>
    );
  }

  if (error) return <ErrorPage message={error.message} />;

  return (
    <>
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
    </>
  );
}

function AuditEventsTab() {
  const [actionFilter, setActionFilter] = useState<"ALL" | AuditActionType>(
    "ALL",
  );
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading, error } = trpc.auditLog.list.useQuery(
    {
      action: actionFilter === "ALL" ? undefined : actionFilter,
      page,
      pageSize,
    },
    { placeholderData: keepPreviousData, staleTime: 5000 },
  );

  if (error) return <ErrorPage message={error.message} />;

  const items = data?.items ?? [];
  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalCount / pageSize))
    : 1;

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Label htmlFor="action-filter">Action</Label>
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setPage(0);
            setActionFilter(v as "ALL" | AuditActionType);
          }}
        >
          <SelectTrigger id="action-filter" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {ALL_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground ml-auto">
            {data.totalCount} entries
          </span>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead className="w-20">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <Loading />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-muted-foreground"
                >
                  No audit entries
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => <AuditExpandableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}

export default function Activity() {
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  if (isPending) return <Loading />;

  return (
    <div className="min-h-screen bg-background py-3 p-6 md:p-8">
      <div className="mb-8 flex items-center gap-3">
        <ScrollText className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Activity</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Full audit trail — transactions and system events."
              : "Item transaction history."}
          </p>
        </div>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="transactions">
          <TabsList className="mb-6">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="audit-events">Audit Events</TabsTrigger>
          </TabsList>
          <TabsContent value="transactions">
            <TransactionsTab />
          </TabsContent>
          <TabsContent value="audit-events">
            <AuditEventsTab />
          </TabsContent>
        </Tabs>
      ) : (
        <TransactionsTab />
      )}
    </div>
  );
}
