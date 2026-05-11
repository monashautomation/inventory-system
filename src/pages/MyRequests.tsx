import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { trpc } from "@/client/trpc";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, PackageOpen, XCircle } from "lucide-react";
import Loading from "@/components/misc/loading";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { RequestStatusType } from "@/server/schema/consumableRequest.schema";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

type RequestRow = inferProcedureOutput<
  AppRouter["consumableRequest"]["listMine"]
>["items"][number];

const ALL_STATUSES = [
  "ALL",
  "PENDING",
  "ORDERED",
  "RECEIVED",
  "CANCELLED",
] as const;
type TabValue = (typeof ALL_STATUSES)[number];

const statusVariant: Record<
  RequestStatusType,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  },
  ORDERED: {
    label: "Ordered",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  RECEIVED: {
    label: "Received",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
};

function StatusBadge({ status }: { status: RequestStatusType }) {
  const v = statusVariant[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}

export default function MyRequests() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");

  const [tab, setTab] = useState<TabValue>("ALL");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const [cancelTarget, setCancelTarget] = useState<RequestRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.consumableRequest.listMine.useQuery(
    {
      status: tab === "ALL" ? undefined : tab,
      page,
      pageSize,
    },
    { placeholderData: keepPreviousData, staleTime: 5000 },
  );

  const cancelMut = trpc.consumableRequest.cancel.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled");
      void utils.consumableRequest.listMine.invalidate();
      void utils.consumableRequest.myPendingCount.invalidate();
      setCancelTarget(null);
    },
    onError: (e) => toast.error("Cancel failed", { description: e.message }),
  });

  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [data]);

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="container mx-auto py-3 p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">My Requests</h1>
        <p className="text-muted-foreground">
          Track consumable requests you have submitted.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabValue);
          setPage(0);
        }}
        className="mb-4"
      >
        <TabsList>
          {ALL_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s === "ALL" ? "All" : statusVariant[s].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {totalCount > 0 && (
        <p className="text-sm text-muted-foreground mb-3">{totalCount} total</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <Loading />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-16 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <PackageOpen className="size-10 opacity-30" />
                    <span>No requests yet</span>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/consumables">Browse consumables</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => {
                const isHighlighted = r.id === highlightId;
                const supplierName =
                  r.supplier?.name ?? r.customSupplier ?? "—";
                const supplierUrl = r.supplier?.url ?? r.customUrl ?? null;
                const ageDays = Math.floor(
                  (Date.now() - new Date(r.createdAt).getTime()) / 86400000,
                );
                return (
                  <TableRow
                    key={r.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={cn(
                      isHighlighted &&
                        "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    )}
                  >
                    <TableCell className="font-medium">
                      {r.consumable.item?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell>
                      {r.fulfilledQty != null && r.fulfilledQty !== r.quantity
                        ? `${r.fulfilledQty} / ${r.quantity}`
                        : r.quantity}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 max-w-[200px]">
                        <span className="truncate">{supplierName}</span>
                        {supplierUrl && (
                          <a
                            href={supplierUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Open supplier link"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ageDays === 0 ? "today" : `${ageDays}d ago`}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            setCancelTarget(r);
                            setCancelReason("");
                          }}
                          disabled={cancelMut.isPending}
                        >
                          <XCircle className="size-3.5 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
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

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel request</DialogTitle>
            <DialogDescription>
              {cancelTarget?.consumable.item?.name} — provide an optional
              reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelTarget) return;
                cancelMut.mutate({
                  id: cancelTarget.id,
                  cancelReason: cancelReason || null,
                });
              }}
              disabled={cancelMut.isPending}
            >
              {cancelMut.isPending ? "Cancelling…" : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
