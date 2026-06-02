"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/client/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import Loading from "@/components/misc/loading";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";

interface PrintLogRow {
  id: string;
  logEntryId: number | null;
  archiveId: number | null;
  printName: string | null;
  printerName: string | null;
  printerId: number | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  filamentType: string | null;
  filamentColor: string | null;
  filamentUsedGrams: number | null;
  createdByUsername: string | null;
  notionProjectName: string | null;
  personalUse: boolean | null;
  createdAt: string;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "cancelled":
      return <Ban className="h-4 w-4 text-orange-500" />;
    case "pending":
    case "printing":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "missed":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "cancelled":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "pending":
    case "printing":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "missed":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    default:
      return "";
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatGrams(g: number | null): string {
  if (g == null) return "—";
  if (g >= 1000) return `${(g / 1000).toFixed(2)}kg`;
  return `${g.toFixed(1)}g`;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
  { value: "missed", label: "Missed" },
];

export default function PrintHistory() {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [printerId, setPrinterId] = useState<number | undefined>();

  const { data: printers } = trpc.printStats.printers.useQuery();

  const { data, isLoading, error } = trpc.printStats.printLog.useQuery(
    {
      page: pageIndex,
      pageSize,
      status: status === "all" ? undefined : status,
      search: search || undefined,
      printerId,
    },
    { placeholderData: keepPreviousData, staleTime: 5_000 },
  );

  const rows: PrintLogRow[] = (data?.items ?? []).map((e) => ({
    id: e.id,
    logEntryId: e.logEntryId,
    archiveId: e.archiveId,
    printName: e.printName,
    printerName: e.printerName,
    printerId: e.printerId,
    status: e.status,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
    durationSeconds: e.durationSeconds,
    filamentType: e.filamentType,
    filamentColor: e.filamentColor,
    filamentUsedGrams: e.filamentUsedGrams,
    createdByUsername: e.createdByUsername,
    notionProjectName: e.notionProjectName,
    personalUse: e.personalUse,
    createdAt: e.createdAt,
  }));

  const columns: ColumnDef<PrintLogRow, unknown>[] = [
    {
      accessorKey: "startedAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => {
        const d = new Date(row.original.startedAt ?? row.original.createdAt);
        return (
          <div className="group relative cursor-default p-2">
            <span className="text-sm text-muted-foreground">
              {d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <div className="absolute z-10 invisible group-hover:visible bg-neutral-800 text-white text-xs rounded py-1 px-2 -mt-8 whitespace-nowrap">
              {d.toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "numeric",
                hour12: true,
              })}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "printName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Print" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 p-2">
          {row.original.logEntryId != null && (
            <img
              src={`/api/bambu-thumbnail/${row.original.logEntryId}`}
              alt=""
              className="h-8 w-8 rounded object-cover flex-shrink-0 bg-muted"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span className="font-medium truncate max-w-[180px]">
            {row.original.printName ?? "Unnamed"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <div className="p-2">
          <Badge
            variant="secondary"
            className={cn(
              "flex w-fit items-center gap-1",
              statusColor(row.original.status),
            )}
          >
            {statusIcon(row.original.status)}
            {row.original.status}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "printerName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Printer" />
      ),
      cell: ({ row }) => (
        <span className="p-2 text-sm">{row.original.printerName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "createdByUsername",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => (
        <span className="p-2 text-sm text-muted-foreground">
          {row.original.createdByUsername ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "notionProjectName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Project" />
      ),
      cell: ({ row }) => (
        <span className="p-2 text-sm text-muted-foreground">
          {row.original.notionProjectName ??
            (row.original.personalUse ? "Personal use" : "Unknown")}
        </span>
      ),
    },
    {
      accessorKey: "filamentType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Filament" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 p-2">
          {row.original.filamentColor && (
            <span
              className="h-3 w-3 rounded-full flex-shrink-0 border border-border"
              style={{
                background: `#${row.original.filamentColor.replace(/^#/, "")}`,
              }}
            />
          )}
          <span className="text-sm">{row.original.filamentType ?? "—"}</span>
        </div>
      ),
    },
    {
      accessorKey: "filamentUsedGrams",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Used" />
      ),
      cell: ({ row }) => (
        <span className="p-2 text-sm font-mono">
          {formatGrams(row.original.filamentUsedGrams)}
        </span>
      ),
    },
    {
      accessorKey: "durationSeconds",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Duration" />
      ),
      cell: ({ row }) => (
        <span className="p-2 text-sm text-muted-foreground">
          {formatDuration(row.original.durationSeconds)}
        </span>
      ),
    },
  ];

  return (
    <div className="bg-background p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Print History</h1>
        <p className="text-muted-foreground">
          Complete record of all prints across the team
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Could not load print history — check BambuBuddy connection.
        </div>
      )}

      {isLoading && !data && (
        <div className="flex h-64 items-center justify-center">
          <Loading />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search prints…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPageIndex(0);
          }}
          className="w-48"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPageIndex(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {printers && printers.length > 0 && (
          <Select
            value={printerId != null ? String(printerId) : "all"}
            onValueChange={(v) => {
              setPrinterId(v === "all" ? undefined : Number(v));
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All printers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All printers</SelectItem>
              {printers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!isLoading || data ? (
        <div className="rounded-lg overflow-hidden shadow-lg">
          <DataTable
            data={rows}
            columns={columns}
            pageIndex={pageIndex}
            pageSize={pageSize}
            onPageChange={setPageIndex}
            onPageSizeChange={setPageSize}
            totalCount={data?.total}
            filterKey="printName"
            BarComponents={() => (
              <div className="flex items-center mr-2">
                <span className="text-sm text-muted-foreground">
                  {data?.total ?? 0} {data?.total === 1 ? "print" : "prints"}{" "}
                  found
                </span>
              </div>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
