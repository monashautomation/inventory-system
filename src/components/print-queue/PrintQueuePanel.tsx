import { trpc } from "@/client/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Trash2,
  XCircle,
  RefreshCw,
  Square,
  Clock,
  CalendarClock,
  User,
  Printer,
  AlertTriangle,
  Package,
  FolderOpen,
  SkipForward,
  Wrench,
  ChevronDown,
  ChevronUp,
  CheckSquare,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";
import { PrintRatingDialog } from "@/components/print/PrintRatingDialog";
import {
  FilamentColorPicker,
  type FilamentColorCandidate,
} from "@/components/print-queue/FilamentColorPicker";

type QueueItem =
  inferRouterOutputs<AppRouter>["printQueue"]["listQueue"][number];
type QueueStatus = QueueItem["status"];

function humaniseWaitingReason(
  raw: string,
  filamentOverrides?: QueueItem["filament_overrides"],
): string {
  const s = raw.toLowerCase();
  if (
    s.includes("color") ||
    s.includes("colour") ||
    s.includes("colour_match") ||
    s.includes("color_match")
  ) {
    const colours =
      filamentOverrides && filamentOverrides.length > 0
        ? filamentOverrides
            .map((o) => o.color_name ?? o.color)
            .filter(Boolean)
            .join(", ")
        : null;
    return colours
      ? `Waiting for a printer with ${colours} loaded to become available. The job will start automatically once a compatible printer is free.`
      : "Waiting for a printer with matching filament colours to become available. The job will start automatically once a compatible printer is free.";
  }
  if (s.includes("plate") || s.includes("clear"))
    return "Waiting for the build plate to be cleared. Collect the previous print from the printer, then mark the plate as cleared in Printer Monitoring.";
  if (
    s.includes("no_printer") ||
    s.includes("no printer") ||
    s.includes("unavailable")
  )
    return "No compatible printer is currently available. The job will start automatically when one becomes free.";
  if (s.includes("filament") || s.includes("spool"))
    return "Waiting for the required filament type to be loaded on a printer. Load the correct spool and the job will start automatically.";
  if (s.includes("scheduled"))
    return "This print is scheduled for a future time and will start automatically when the scheduled time is reached.";
  // Return the raw reason with a prefix if none of the patterns match
  return `On hold: ${raw}`;
}

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

function splitFilamentColors(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.includes(";") || trimmed.includes(",")) {
    return trimmed
      .split(/[;,]/)
      .map((s) => s.replace(/^#/, "").trim())
      .filter(Boolean);
  }
  const clean = trimmed.replace(/^#/, "");
  const chunks: string[] = [];
  for (let i = 0; i + 6 <= clean.length; i += 6) {
    chunks.push(clean.slice(i, i + 6));
  }
  return chunks.length > 0 ? chunks : [clean];
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
      style={{ backgroundColor: `#${hex.slice(0, 6)}` }}
    />
  );
}

interface PrinterConnectivity {
  id: number;
  name: string;
  connected: boolean;
  awaitingPlateClear?: boolean;
}

function QueueItemRow({
  item,
  connectivity,
  onStop,
  onCancel,
  onDelete,
  onResolveFilamentShort,
  colourUnavailable,
  needsPlateClear,
  onConfirmPlateClear,
}: {
  item: QueueItem;
  connectivity: PrinterConnectivity[];
  onStop: (id: number) => void;
  onCancel: (id: number) => void;
  onDelete: (id: number) => void;
  onResolveFilamentShort: (id: number) => void;
  colourUnavailable?: boolean;
  needsPlateClear?: boolean;
  onConfirmPlateClear?: () => void;
}) {
  const status = item.status?.toLowerCase() as QueueStatus;
  const isPending = status === "pending";

  // A pending job never waits on a human - if it can't proceed, its
  // assigned printer has a real hardware problem. Surface that as an error
  // state rather than a "held" one.
  const hasPrinterError =
    isPending &&
    item.printerHmsErrors != null &&
    item.printerHmsErrors.length > 0;

  // Operational issues (filament out, cover open) are orange; real
  // hardware faults stay red.
  const printerErrorIsWarning =
    hasPrinterError && item.printerHmsErrors!.every((e) => e.operational);

  // Flag-only errors (a bad file, a cancelled job) are shown but do not block.
  const printerErrorIsFlagOnly =
    hasPrinterError && item.printerHmsErrors!.every((e) => !e.blocking);

  const statusConfig = hasPrinterError
    ? printerErrorIsFlagOnly
      ? {
          label: "Notice",
          className:
            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        }
      : printerErrorIsWarning
        ? {
            label: "Action needed",
            className:
              "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
          }
        : {
            label: "Error",
            className:
              "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
          }
    : (STATUS_CONFIG[status] ?? {
        label: status,
        className: "bg-slate-100 text-slate-600",
      });

  const isPrinting = status === "printing";
  const isTerminal = ["completed", "failed", "cancelled", "skipped"].includes(
    status,
  );

  const offlinePrinter =
    isPending && item.printer_id != null
      ? (connectivity.find((c) => c.id === item.printer_id && !c.connected) ??
        null)
      : null;

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
          <span className="text-xs font-mono text-muted-foreground/50">-</span>
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
          {item.filament_overrides && item.filament_overrides.length > 0 ? (
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {item.filament_overrides.map((o, i) => (
                <span key={i} title={`${o.type} - ${o.color_name}`}>
                  <ColorSwatch hex={o.color.replace("#", "")} />
                </span>
              ))}
            </span>
          ) : item.filament_type ? (
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {item.filament_type}
              {item.filament_color &&
                splitFilamentColors(item.filament_color).map((hex, i) => (
                  <ColorSwatch key={i} hex={hex} />
                ))}
            </span>
          ) : null}
          {item.filament_used_grams != null && (
            <span>{item.filament_used_grams.toFixed(1)}g</span>
          )}
          {item.created_by_username && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.created_by_username}
            </span>
          )}
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {item.notionProjectName ??
              (item.personalUse ? "Personal use" : "-")}
          </span>
          {item.scheduled_time && (
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {new Date(item.scheduled_time).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
          {item.been_jumped && (
            <span className="flex items-center gap-1 text-orange-500 dark:text-orange-400">
              <SkipForward className="h-3 w-3" />
              Skipped - waiting for compatible printer
            </span>
          )}
        </div>

        {/* Deleted archive warning - only actionable on pending */}
        {item.archive_deleted && isPending && (
          <div className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
            <span>
              The print file has been deleted from Bambuddy and this job will
              fail when dispatched. Cancel this job and re-queue with a valid
              file.
            </span>
          </div>
        )}

        {/* Offline printer */}
        {offlinePrinter && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
            <span>
              <strong>{offlinePrinter.name}</strong> is currently offline. This
              job will start automatically once the printer reconnects.
            </span>
          </div>
        )}

        {/* Printer error - AMS/HMS errors on the assigned printer */}
        {hasPrinterError && (
          <div
            className={`rounded-md border px-2 py-1.5 space-y-1 ${
              printerErrorIsFlagOnly
                ? "border-border bg-muted text-muted-foreground"
                : printerErrorIsWarning
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="flex items-start gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
              <span>
                {printerLabel}{" "}
                {printerErrorIsFlagOnly
                  ? "has a notice - it does not block new prints."
                  : `${printerErrorIsWarning ? "needs attention" : "has an error"} - this job cannot start until it's resolved.`}
              </span>
            </div>
            <ul className="space-y-0.5 pl-[18px]">
              {item.printerHmsErrors!.map((e, i) => (
                <li key={i} className="flex gap-1.5 text-xs">
                  <span className="font-mono shrink-0">{e.code}</span>
                  <span>{e.description}</span>
                  {!e.blocking && e.flagReason ? (
                    <span className="opacity-80">({e.flagReason})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Waiting reason */}
        {item.waiting_reason && isPending && !hasPrinterError && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
            <span>
              {humaniseWaitingReason(
                item.waiting_reason,
                item.filament_overrides ?? undefined,
              )}
            </span>
          </div>
        )}

        {/* Filament short - resolved automatically in the background (see
            autoResolveFilamentShort). Once that comes back "unavailable"
            the colour genuinely isn't loaded on any printer, so ask the
            user to pick a different one instead of silently retrying. */}
        {item.filament_short &&
          isPending &&
          !item.waiting_reason &&
          colourUnavailable && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
              <span className="flex-1">
                That filament colour isn't loaded on any printer right now.
                Choose a different colour to continue.
              </span>
              <button
                className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                onClick={() => onResolveFilamentShort(item.id)}
              >
                <Wrench className="h-2.5 w-2.5" />
                Choose new colour
              </button>
            </div>
          )}

        {/* Been jumped explanation */}
        {item.been_jumped && isPending && (
          <div className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400">
            <SkipForward className="h-3 w-3 shrink-0 mt-px" />
            <span>
              Jobs ahead in the queue could not run on the required printer, so
              this job was skipped over. It will start as soon as a compatible
              printer becomes available.
            </span>
          </div>
        )}

        {/* Error message */}
        {item.error_message && status === "failed" && (
          <p className="text-xs text-destructive truncate">
            {item.error_message}
          </p>
        )}

        {/* Build plate not cleared - this is the most recently completed
            job on the assigned printer, surfaced above the collapsed
            history so the plate can be confirmed cleared right here. */}
        {needsPlateClear && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5">
            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="flex-1 text-xs text-amber-700 dark:text-amber-400">
              Build plate not cleared on {printerLabel} - the next job can't
              start until it's confirmed.
            </span>
            <button
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 transition-colors"
              onClick={onConfirmPlateClear}
            >
              <CheckSquare className="h-2.5 w-2.5" />
              Confirm cleared
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {isPrinting && (
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
        {!isTerminal && (
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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Remove"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

type FilamentShortInfo =
  inferRouterOutputs<AppRouter>["printQueue"]["getFilamentShortInfo"];

interface FilamentShortDialog {
  itemId: number;
  info: FilamentShortInfo;
}

function FilamentShortDialogContent({
  dialog,
  isPending,
  onConfirm,
  onClose,
}: {
  dialog: FilamentShortDialog;
  isPending: boolean;
  onConfirm: (candidate: {
    printerId: number;
    filamentType: string;
    colorHex: string;
  }) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<FilamentColorCandidate | null>(null);
  const info = dialog.info;
  const utils = trpc.useUtils();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl p-5 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-px" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {info.status === "found"
                ? "Confirm filament override"
                : "Choose a colour"}
            </p>

            {info.status === "found" && (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>{info.printerName}</strong> has a matching{" "}
                  {info.colorName ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <ColorSwatch hex={info.colorHex ?? "000000"} />
                        <strong>{info.colorName}</strong>
                      </span>{" "}
                    </>
                  ) : null}
                  <strong>{info.filamentType}</strong> spool with{" "}
                  <strong>{info.remaining.toFixed(1)}g</strong> remaining. This
                  print needs <strong>{info.required.toFixed(1)}g</strong>.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Confirm there is physically enough filament on that spool
                  before proceeding - this will mark it as sufficient and
                  release the job.
                </p>
              </>
            )}

            {info.status === "choose_colour" && (
              <>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {info.filamentColor ? (
                    <>
                      The original <ColorSwatch hex={info.filamentColor} />{" "}
                      colour
                    </>
                  ) : (
                    "The original colour"
                  )}{" "}
                  isn't loaded on any printer. Choose a colour below - same
                  picker as adding a print to the queue:
                </p>
                <FilamentColorPicker
                  type={info.filamentType ?? "filament"}
                  candidates={info.candidates}
                  emptyMessage={`No ${info.filamentType ?? "matching"} spools loaded on any printer.`}
                  selected={
                    selected
                      ? {
                          mode: "color",
                          colorHex: selected.colorHex ?? "",
                          colorName: selected.colorName,
                        }
                      : { mode: "any" }
                  }
                  onSelectAny={() => {
                    const best = [...info.candidates].sort(
                      (a, b) => b.remaining - a.remaining,
                    )[0];
                    setSelected(best ?? null);
                  }}
                  onSelectColor={(candidate) => setSelected(candidate)}
                  onColorsChanged={() =>
                    void utils.printQueue.getFilamentShortInfo.invalidate({
                      itemId: dialog.itemId,
                    })
                  }
                />
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={
              isPending ||
              (info.status === "choose_colour" && selected === null)
            }
            onClick={() => {
              if (info.status === "found") {
                onConfirm({
                  printerId: info.printerId,
                  filamentType: info.filamentType,
                  colorHex: info.colorHex ?? "",
                });
              } else if (selected) {
                onConfirm({
                  printerId: selected.printerId,
                  filamentType: selected.material,
                  colorHex: selected.colorHex ?? "",
                });
              }
            }}
          >
            Yes, start anyway
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PrintQueuePanelProps {
  statusFilter?: string;
}

export function PrintQueuePanel({ statusFilter }: PrintQueuePanelProps) {
  const [filamentShortItemId, setFilamentShortItemId] = useState<number | null>(
    null,
  );
  const [filamentShortDialog, setFilamentShortDialog] =
    useState<FilamentShortDialog | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [plateClearDialog, setPlateClearDialog] = useState<{
    bambuddyId: number;
    printerName: string;
    fileName?: string;
  } | null>(null);

  const {
    data: queueItems,
    isLoading,
    refetch,
  } = trpc.printQueue.listQueue.useQuery(
    { status: statusFilter },
    { refetchInterval: 10_000 },
  );

  const { data: connectivity = [] } =
    trpc.printQueue.listPrinterConnectivity.useQuery(undefined, {
      refetchInterval: 30_000,
    });

  // Filament remaining is not tracked for print blocking. If bambuddy still
  // flags an item as filament_short (e.g. remaining drifted down again
  // between queuing and starting), resolve it automatically - no manual
  // "Start anyway" click required. The colour is topped up to 100% if it's
  // loaded on the assigned printer, the job is reassigned if it's loaded on
  // a different printer, or the item is flagged "unavailable" so the user
  // can pick a different colour.
  const healedFilamentShortItemIds = useRef<Set<number>>(new Set());
  const [unavailableColourItemIds, setUnavailableColourItemIds] = useState<
    Set<number>
  >(new Set());
  const autoResolveFilamentShortMutation =
    trpc.printQueue.autoResolveFilamentShort.useMutation({
      onSuccess: (data, variables) => {
        setUnavailableColourItemIds((prev) => {
          const next = new Set(prev);
          if (data.status === "unavailable") {
            next.add(variables.itemId);
          } else {
            next.delete(variables.itemId);
          }
          return next;
        });
        if (data.status === "resolved_elsewhere") {
          toast.success(
            `Matching filament found on ${data.printerName} - job reassigned`,
          );
        }
        if (data.status !== "unavailable") {
          invalidate();
        }
      },
    });

  useEffect(() => {
    for (const item of queueItems ?? []) {
      if (!item.filament_short) {
        healedFilamentShortItemIds.current.delete(item.id);
        continue;
      }
      if (healedFilamentShortItemIds.current.has(item.id)) continue;

      healedFilamentShortItemIds.current.add(item.id);
      autoResolveFilamentShortMutation.mutate({ itemId: item.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems]);

  const filamentShortQuery = trpc.printQueue.getFilamentShortInfo.useQuery(
    { itemId: filamentShortItemId! },
    { enabled: filamentShortItemId !== null, retry: false },
  );

  useEffect(() => {
    if (filamentShortQuery.data && filamentShortItemId !== null) {
      setFilamentShortDialog({
        itemId: filamentShortItemId,
        info: filamentShortQuery.data,
      });
      setFilamentShortItemId(null);
    }
  }, [filamentShortQuery.data, filamentShortItemId]);

  useEffect(() => {
    if (filamentShortQuery.error && filamentShortItemId !== null) {
      toast.error(filamentShortQuery.error.message);
      setFilamentShortItemId(null);
    }
  }, [filamentShortQuery.error, filamentShortItemId]);

  const utils = trpc.useUtils();

  function invalidate() {
    void utils.printQueue.listQueue.invalidate();
    void utils.printQueue.listPrinterConnectivity.invalidate();
  }

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

  const overrideFilamentShortMutation =
    trpc.printQueue.overrideFilamentShort.useMutation({
      onSuccess: () => {
        toast.success("Spool overridden - print will start automatically");
        setFilamentShortDialog(null);
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
      {/* Build plate clear confirmation dialog */}
      {plateClearDialog && (
        <PrintRatingDialog
          open
          onOpenChange={(open) => {
            if (!open) setPlateClearDialog(null);
          }}
          bambuddyId={plateClearDialog.bambuddyId}
          printerName={plateClearDialog.printerName}
          fileName={plateClearDialog.fileName}
          mode="user"
          onCleared={() => invalidate()}
        />
      )}

      {/* Filament short confirmation dialog */}
      {filamentShortDialog && (
        <FilamentShortDialogContent
          dialog={filamentShortDialog}
          isPending={overrideFilamentShortMutation.isPending}
          onConfirm={(candidate) =>
            overrideFilamentShortMutation.mutate({
              itemId: filamentShortDialog.itemId,
              printerId: candidate.printerId,
              filamentType: candidate.filamentType,
              colorHex: candidate.colorHex,
            })
          }
          onClose={() => setFilamentShortDialog(null)}
        />
      )}

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

      {!isLoading &&
        queueItems &&
        queueItems.length > 0 &&
        (() => {
          const active = [...queueItems]
            .filter((i) => i.status === "printing" || i.status === "pending")
            .sort((a, b) => {
              const rank = (s: string | null | undefined) =>
                s?.toLowerCase() === "printing" ? 0 : 1;
              const ra = rank(a.status);
              const rb = rank(b.status);
              if (ra !== rb) return ra - rb;
              return (a.position ?? 0) - (b.position ?? 0);
            });

          // Printers whose build plate hasn't been confirmed cleared block
          // their next job - surface the job that left them in that state
          // (their most recently completed print) above the collapsed
          // history, un-hidden, with a button to confirm it right here.
          const printersNeedingClear = new Set(
            connectivity.filter((c) => c.awaitingPlateClear).map((c) => c.id),
          );
          const plateClearItemIds = new Set<number>();
          for (const printerId of printersNeedingClear) {
            const mostRecent = queueItems
              .filter(
                (i) => i.printer_id === printerId && i.status === "completed",
              )
              .sort((a, b) =>
                (b.completed_at ?? b.created_at ?? "").localeCompare(
                  a.completed_at ?? a.created_at ?? "",
                ),
              )[0];
            if (mostRecent) plateClearItemIds.add(mostRecent.id);
          }
          const plateClearItems = [...queueItems]
            .filter((i) => plateClearItemIds.has(i.id))
            .sort((a, b) =>
              (b.completed_at ?? b.created_at ?? "").localeCompare(
                a.completed_at ?? a.created_at ?? "",
              ),
            );

          // Completed/failed/skipped/cancelled jobs are done - auto-collapse
          // them behind a toggle so the panel stays focused on what's live.
          const history = [...queueItems]
            .filter(
              (i) =>
                i.status !== "printing" &&
                i.status !== "pending" &&
                !plateClearItemIds.has(i.id),
            )
            .sort((a, b) =>
              (b.completed_at ?? b.created_at ?? "").localeCompare(
                a.completed_at ?? a.created_at ?? "",
              ),
            );

          const rowProps = {
            connectivity,
            onStop: (id: number) => stopMutation.mutate({ itemId: id }),
            onCancel: (id: number) => cancelMutation.mutate({ itemId: id }),
            onDelete: (id: number) => deleteMutation.mutate({ itemId: id }),
            onResolveFilamentShort: (id: number) => setFilamentShortItemId(id),
          };

          return (
            <div>
              {active.length === 0 &&
                plateClearItems.length === 0 &&
                history.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No active jobs
                  </p>
                )}
              {active.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  {...rowProps}
                  colourUnavailable={unavailableColourItemIds.has(item.id)}
                />
              ))}

              {plateClearItems.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  {...rowProps}
                  colourUnavailable={unavailableColourItemIds.has(item.id)}
                  needsPlateClear
                  onConfirmPlateClear={() =>
                    item.printer_id != null &&
                    setPlateClearDialog({
                      bambuddyId: item.printer_id,
                      printerName: item.printer_name ?? `#${item.printer_id}`,
                      fileName:
                        item.archive_name ??
                        item.library_file_name ??
                        undefined,
                    })
                  }
                />
              ))}

              {history.length > 0 && (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground py-2"
                    onClick={() => setShowHistory((v) => !v)}
                  >
                    {showHistory ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showHistory ? "Hide" : "Show"} {history.length} finished
                    job
                    {history.length === 1 ? "" : "s"}
                  </button>
                  {showHistory &&
                    history.map((item) => (
                      <QueueItemRow key={item.id} item={item} {...rowProps} />
                    ))}
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
}
