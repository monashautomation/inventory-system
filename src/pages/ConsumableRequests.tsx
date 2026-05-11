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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumberInput } from "@/components/inputs/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  ExternalLink,
  PackageCheck,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import Loading from "@/components/misc/loading";
import ErrorPage from "@/pages/Error";
import { authClient } from "@/auth/client";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import type { RequestStatusType } from "@/server/schema/consumableRequest.schema";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

type RequestRow = inferProcedureOutput<
  AppRouter["consumableRequest"]["list"]
>["items"][number];

const STATUSES: RequestStatusType[] = [
  "PENDING",
  "ORDERED",
  "RECEIVED",
  "CANCELLED",
];

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

export default function ConsumableRequests() {
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const [statusFilter, setStatusFilter] = useState<"ALL" | RequestStatusType>(
    "PENDING",
  );
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.consumableRequest.list.useQuery(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      page,
      pageSize,
    },
    {
      placeholderData: keepPreviousData,
      staleTime: 1000,
      enabled: isAdmin,
    },
  );

  const [receiveTarget, setReceiveTarget] = useState<RequestRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RequestRow | null>(null);
  const [fulfilled, setFulfilled] = useState(1);
  const [cancelReason, setCancelReason] = useState("");

  const refresh = () => {
    void utils.consumableRequest.list.invalidate();
    void utils.consumableRequest.pendingCount.invalidate();
    void utils.consumable.list.invalidate();
    void utils.item.list.invalidate();
  };

  const updateMut = trpc.consumableRequest.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
      setReceiveTarget(null);
      setCancelTarget(null);
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  if (isPending) return <Loading />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (error) return <ErrorPage message={error.message} />;

  const items = data?.items ?? [];
  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalCount / pageSize))
    : 1;

  return (
    <div className="container mx-auto py-3 p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Consumable Requests</h1>
        <p className="text-muted-foreground">
          Review pending requests, mark ordered, and confirm receipts.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Label htmlFor="status">Status</Label>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setPage(0);
            setStatusFilter(v as "ALL" | RequestStatusType);
          }}
        >
          <SelectTrigger id="status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusVariant[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-muted-foreground ml-auto">
            {data.totalCount} total
          </span>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Age</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loading />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-10 text-muted-foreground"
                >
                  No requests
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => {
                const supplierName =
                  r.supplier?.name ?? r.customSupplier ?? "—";
                const supplierUrl = r.supplier?.url ?? r.customUrl ?? null;
                const ageMs = Date.now() - new Date(r.createdAt).getTime();
                const ageDays = Math.floor(ageMs / 86400000);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.consumable.item?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell>
                      {r.fulfilledQty != null && r.fulfilledQty !== r.quantity
                        ? `${r.fulfilledQty} / ${r.quantity}`
                        : r.quantity}
                    </TableCell>
                    <TableCell>{r.requestedBy.name}</TableCell>
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
                      {ageDays === 0 ? "today" : `${ageDays}d`}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateMut.mutate({
                                id: r.id,
                                status: "ORDERED",
                              })
                            }
                            disabled={updateMut.isPending}
                          >
                            <ShoppingBag className="size-3.5" />
                            Order
                          </Button>
                        )}
                        {(r.status === "PENDING" || r.status === "ORDERED") && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setReceiveTarget(r);
                              setFulfilled(r.quantity);
                            }}
                            disabled={updateMut.isPending}
                          >
                            <PackageCheck className="size-3.5" />
                            Receive
                          </Button>
                        )}
                        {r.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              setCancelTarget(r);
                              setCancelReason("");
                            }}
                            disabled={updateMut.isPending}
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        )}
                        {r.status === "RECEIVED" && (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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

      <Dialog
        open={!!receiveTarget}
        onOpenChange={(open) => !open && setReceiveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark received</DialogTitle>
            <DialogDescription>
              {receiveTarget?.consumable.item?.name} — confirm the actual
              quantity received. Stock will be incremented.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>Fulfilled quantity</Label>
            <NumberInput
              min={1}
              max={100000}
              value={fulfilled}
              onValueChange={(n) => setFulfilled(n ?? 1)}
              className=""
            />
            {receiveTarget && fulfilled !== receiveTarget.quantity && (
              <p className="text-xs text-amber-600">
                Differs from requested ({receiveTarget.quantity}).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!receiveTarget) return;
                updateMut.mutate({
                  id: receiveTarget.id,
                  status: "RECEIVED",
                  fulfilledQty: fulfilled,
                });
              }}
              disabled={updateMut.isPending || fulfilled < 1}
            >
              {updateMut.isPending ? "Saving…" : "Confirm receive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                updateMut.mutate({
                  id: cancelTarget.id,
                  status: "CANCELLED",
                  cancelReason: cancelReason || null,
                });
              }}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? "Cancelling…" : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
