import { trpc } from "@/client/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Trash2,
  XCircle,
  RefreshCw,
  Play,
  Square,
  Clock,
  User,
  Printer,
  AlertTriangle,
  Package,
  FolderOpen,
} from "lucide-react";
import { authClient } from "@/auth/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";

type QueueItem =
  inferRouterOutputs<AppRouter>["printQueue"]["listQueue"][number];
type QueueStatus = QueueItem["status"];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  printing: {
    label: "Printing",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  completed: {
    label: "Done",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  skipped: {
    label: "Skipped",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
      style={{ backgroundColor: `#${hex.slice(0, 6)}` }}
    />
  );
}

function QueueItemRow({
  item,
  isAdmin,
  onStart,
  onStop,
  onCancel,
  onDelete,
}: {
  item: QueueItem;
  isAdmin: boolean;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const status = item.status?.toLowerCase() as QueueStatus;
  const statusConfig = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600",
  };

  const isPending = status === "pending";
  const isPrinting = status === "printing";
  const isTerminal = ["completed", "failed", "cancelled", "skipped"].includes(
    status,
  );

  const displayName =
    item.archive_name ??
    item.library_file_name ??
    (item.archive_id ? `Archive #${item.archive_id}` : null) ??
    (item.library_file_id ? `File #${item.library_file_id}` : null) ??
    "Unknown";

  const printerLabel =
    item.printer_name ??
    (item.target_model ? `Any ${item.target_model}` : null) ??
    (item.printer_id ? `Printer #${item.printer_id}` : "Any printer");

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/40 last:border-0 group">
      {/* Position indicator */}
      <div className="mt-0.5 w-6 text-center shrink-0">
        {isPrinting ? (
          <span className="flex h-5 w-5 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </span>
        ) : isTerminal ? (
          <span className="text-xs font-mono text-muted-foreground/50">—</span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">
            #{item.position}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Name + status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate flex-1 min-w-0">
            {displayName}
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
          {item.manual_start && isPending && (
            <Badge
              variant="outline"
              className="text-xs shrink-0 border-amber-400/60 text-amber-600 dark:text-amber-400"
            >
              manual
            </Badge>
          )}
          {item.timelapse && (
            <Badge variant="outline" className="text-xs shrink-0">
              timelapse
            </Badge>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Printer className="h-3 w-3" />
            {printerLabel}
            {item.sliced_for_model &&
              !item.printer_id &&
              !item.target_model && (
                <span className="opacity-60">({item.sliced_for_model})</span>
              )}
          </span>
          {item.print_time_seconds != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(item.print_time_seconds)}
            </span>
          )}
          {item.filament_type && (
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {item.filament_type}
              {item.filament_color && (
                <ColorSwatch hex={item.filament_color.replace("#", "")} />
              )}
            </span>
          )}
          {item.filament_used_grams != null && (
            <span>{item.filament_used_grams.toFixed(1)}g</span>
          )}
          {item.created_by_username && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.created_by_username}
            </span>
          )}
          {item.notionProjectName && (
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {item.notionProjectName}
            </span>
          )}
        </div>

        {/* Waiting reason */}
        {item.waiting_reason && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{item.waiting_reason}</span>
          </div>
        )}

        {/* Error message */}
        {item.error_message && status === "failed" && (
          <p className="text-xs text-destructive truncate">
            {item.error_message}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isAdmin && isPending && item.manual_start && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
            title="Start print"
            onClick={() => onStart(item.id)}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAdmin && isPrinting && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
            title="Stop print"
            onClick={() => onStop(item.id)}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAdmin && !isTerminal && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Cancel"
            onClick={() => onCancel(item.id)}
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Remove"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface PrintQueuePanelProps {
  statusFilter?: string;
}

export function PrintQueuePanel({ statusFilter }: PrintQueuePanelProps) {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const {
    data: queueItems,
    isLoading,
    refetch,
  } = trpc.printQueue.listQueue.useQuery(
    { status: statusFilter },
    { refetchInterval: 10_000 },
  );

  const utils = trpc.useUtils();

  function invalidate() {
    void utils.printQueue.listQueue.invalidate();
  }

  const startMutation = trpc.printQueue.startQueueItem.useMutation({
    onSuccess: () => {
      toast.success("Print started");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const stopMutation = trpc.printQueue.stopQueueItem.useMutation({
    onSuccess: () => {
      toast.success("Print stopped");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.printQueue.cancelQueueItem.useMutation({
    onSuccess: () => {
      toast.success("Item cancelled");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.printQueue.deleteQueueItem.useMutation({
    onSuccess: () => {
      toast.success("Item removed");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const printingCount =
    queueItems?.filter((i) => i.status === "printing").length ?? 0;
  const pendingCount =
    queueItems?.filter((i) => i.status === "pending").length ?? 0;

  return (
    <div className="space-y-1">
      {/* Header stats */}
      {!isLoading && queueItems && queueItems.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground pb-1">
          {printingCount > 0 && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {printingCount} printing
            </span>
          )}
          {pendingCount > 0 && <span>{pendingCount} pending</span>}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 ml-auto text-xs"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (!queueItems || queueItems.length === 0) && (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground">
            {statusFilter ? `No ${statusFilter} jobs` : "Queue is empty"}
          </p>
        </div>
      )}

      {!isLoading && queueItems && queueItems.length > 0 && (
        <div>
          {[...queueItems]
            .sort((a, b) => {
              const rank = (s: string | null | undefined) => {
                const st = s?.toLowerCase();
                if (st === "printing") return 0;
                if (st === "pending") return 1;
                return 2;
              };
              const ra = rank(a.status);
              const rb = rank(b.status);
              if (ra !== rb) return ra - rb;
              if (ra === 0 || ra === 1) return (a.position ?? 0) - (b.position ?? 0);
              // terminal: most recent first
              return (b.completed_at ?? b.created_at ?? "").localeCompare(
                a.completed_at ?? a.created_at ?? "",
              );
            })
            .map((item) => (
            <QueueItemRow
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onStart={(id) => startMutation.mutate({ itemId: id })}
              onStop={(id) => stopMutation.mutate({ itemId: id })}
              onCancel={(id) => cancelMutation.mutate({ itemId: id })}
              onDelete={(id) => deleteMutation.mutate({ itemId: id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
