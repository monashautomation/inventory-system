import { useState } from "react";
import { trpc } from "@/client/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import Loading from "@/components/misc/loading";
import ErrorPage from "@/pages/Error";
import { authClient } from "@/auth/client";
import { Navigate } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditActionType } from "@/server/schema/auditLog.schema";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

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

function ExpandableRow({ row }: { row: AuditRow }) {
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
          <span className="text-sm">{row.actor?.name ?? "System"}</span>
          {row.actor?.email && (
            <span className="block text-xs text-muted-foreground">
              {row.actor.email}
            </span>
          )}
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

export default function AuditLog() {
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

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
    {
      placeholderData: keepPreviousData,
      staleTime: 5000,
      enabled: isAdmin,
    },
  );

  if (isPending) return <Loading />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (error) return <ErrorPage message={error.message} />;

  const items = data?.items ?? [];
  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalCount / pageSize))
    : 1;

  return (
    <div className="container mx-auto py-3 p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">
            Full history of consumable request actions.
          </p>
        </div>
      </div>

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
              items.map((row) => <ExpandableRow key={row.id} row={row} />)
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
    </div>
  );
}
