import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Video, Loader2 } from "lucide-react";
import type { CachedPrinterStatus } from "@/server/lib/printCamPoller";

type CameraMode = "stream" | "snapshot";

const PAGE_SIZE = 12;

const buildCameraUrl = (
  printerId: string,
  mode: CameraMode,
  tick: number,
): string => {
  const base = `/api/webcam/${encodeURIComponent(printerId)}`;
  if (mode === "snapshot") {
    return `${base}?mode=cached_snapshot&_t=${tick}`;
  }
  return base;
};

const formatDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const statusColor = (state: string) => {
  const s = state.toUpperCase();
  if (["PRINTING", "PAUSED", "BUSY"].includes(s)) return "bg-yellow-500";
  if (["ATTENTION", "UNREACHABLE"].includes(s)) return "bg-red-500";
  if (["IDLE", "READY", "FINISHED"].includes(s)) return "bg-green-500";
  return "bg-muted-foreground";
};

const statusBadgeVariant = (
  state: string,
): "default" | "secondary" | "destructive" | "outline" => {
  const s = state.toUpperCase();
  if (["PRINTING", "PAUSED", "BUSY"].includes(s)) return "secondary";
  if (["ATTENTION", "UNREACHABLE"].includes(s)) return "destructive";
  if (["IDLE", "READY", "FINISHED"].includes(s)) return "default";
  return "outline";
};

// ─── Printer overview card ────────────────────────────────────────────────────

function PrinterCard({
  status,
  onClick,
}: {
  status: CachedPrinterStatus;
  onClick: () => void;
}) {
  return (
    <Card
      className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 bg-card border-border/50"
      onClick={onClick}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-colors duration-500 z-20 ${statusColor(status.state)}`}
      />

      <CardContent className="px-4 py-2 flex flex-col h-full gap-3 relative z-10 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col min-w-0 flex-1 space-y-1">
            <h3 className="font-bold text-base tracking-tight truncate group-hover:text-primary transition-colors">
              {status.printerName}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border/50 shrink-0">
                {status.printerType}
              </span>
              <span className="font-mono text-[10px] opacity-70 truncate">
                {status.ipAddress}
              </span>
            </div>
            <p
              className={`text-[11px] truncate ${["ATTENTION", "UNREACHABLE", "ERROR"].includes(status.state.toUpperCase()) ? "text-destructive font-medium" : "text-muted-foreground"}`}
              title={status.stateMessage}
            >
              {status.stateMessage}
            </p>
          </div>
          <Badge
            variant={statusBadgeVariant(status.state)}
            className="shrink-0 mt-0.5 pl-2 pr-2.5 py-1 shadow-sm transition-colors border-border/20"
          >
            <span
              className={`h-2 w-2 rounded-full mr-1.5 ${statusColor(status.state)} ${["PRINTING", "BUSY"].includes(status.state.toUpperCase()) ? "animate-pulse" : ""}`}
            />
            <span className="uppercase text-[10px] tracking-wider font-bold whitespace-nowrap">
              {status.state}
            </span>
          </Badge>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Progress
              </span>
              <span className="text-2xl font-black tracking-tighter tabular-nums leading-none">
                {status.progress != null
                  ? `${status.progress.toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex flex-col text-right shrink-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Remaining
              </span>
              <span className="text-base font-bold tabular-nums leading-none text-foreground/80">
                {status.timeRemaining != null
                  ? formatDuration(status.timeRemaining)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/80 shadow-inner border border-border/40">
            <div
              className={`h-full transition-all duration-1000 ease-out rounded-full ${statusColor(status.state)}`}
              style={{ width: `${status.progress ?? 0}%` }}
            />
          </div>
        </div>

        <div className="mt-auto space-y-1.5">
          {status.startedBy ? (
            <div className="bg-primary/5 rounded-md px-2.5 py-1.5 border border-primary/20">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Printed by
              </span>
              <p
                className="text-sm font-semibold truncate text-foreground"
                title={status.startedBy.name}
              >
                {status.startedBy.name}
              </p>
            </div>
          ) : null}
          <div className="bg-secondary/30 rounded-md px-2.5 py-1.5 border border-border/50 transition-colors group-hover:bg-secondary/50">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
              Current File
            </span>
            <p
              className={`text-sm font-medium truncate ${!status.fileName ? "text-muted-foreground/60 italic" : "text-foreground"}`}
              title={status.fileName ?? undefined}
            >
              {status.fileName ?? "No active print"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Printer detail dialog ────────────────────────────────────────────────────

function PrinterDetail({
  status,
  onClose,
}: {
  status: CachedPrinterStatus;
  onClose: () => void;
}) {
  const pauseMutation = trpc.print.pausePrint.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(error.message),
  });

  const resumeMutation = trpc.print.resumePrint.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = trpc.print.cancelPrint.useMutation({
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(error.message),
  });

  const [cameraMode, setCameraMode] = useState<CameraMode>("snapshot");
  const [snapshotTick, setSnapshotTick] = useState(() => Date.now());

  useEffect(() => {
    if (cameraMode !== "snapshot") return;
    const id = setInterval(() => setSnapshotTick(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [cameraMode]);

  const cameraUrl = useMemo(() => {
    if (!status.webcamUrl) return null;
    return buildCameraUrl(status.printerId, cameraMode, snapshotTick);
  }, [cameraMode, status.printerId, status.webcamUrl, snapshotTick]);

  const upperState = status.state.toUpperCase();
  const isPrinting = upperState === "PRINTING";
  const isPaused = upperState === "PAUSED";
  const canPause = isPrinting;
  const canResume = isPaused;
  const canCancel = isPrinting || isPaused;
  const anyCommandPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status.printerName}
            <span className="text-sm font-normal text-muted-foreground">
              {status.printerType} &bull; {status.ipAddress}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${statusColor(status.state)}`}
              />
              <span className="font-semibold">{status.stateMessage}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nozzle
            </span>
            <span className="font-semibold text-lg">
              {status.nozzleTemp != null ? status.nozzleTemp.toFixed(1) : "—"}°C
              {" / "}
              {status.targetNozzleTemp != null
                ? status.targetNozzleTemp.toFixed(1)
                : "—"}
              °C
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bed
            </span>
            <span className="font-semibold text-lg">
              {status.bedTemp != null ? status.bedTemp.toFixed(1) : "—"}°C
              {" / "}
              {status.targetBedTemp != null
                ? status.targetBedTemp.toFixed(1)
                : "—"}
              °C
            </span>
          </div>

          {status.chamberTemp != null ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Chamber
              </span>
              <span className="font-semibold text-lg">
                {status.chamberTemp.toFixed(1)}°C
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card col-span-2 md:col-span-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Progress
            </span>
            <div className="flex flex-col gap-2 mt-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${status.progress ?? 0}%` }}
                />
              </div>
              <span className="font-semibold text-sm">
                {status.progress != null
                  ? `${status.progress.toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Time Remaining
            </span>
            <span className="font-semibold text-lg">
              {status.timeRemaining != null
                ? formatDuration(status.timeRemaining)
                : "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              File Name
            </span>
            <span
              className="font-semibold truncate"
              title={status.fileName ?? undefined}
            >
              {status.fileName ?? "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Filament
            </span>
            <span className="font-semibold">{status.filamentType ?? "—"}</span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Printed By
            </span>
            <span
              className="font-semibold truncate"
              title={status.startedBy?.name ?? undefined}
            >
              {status.startedBy?.name ?? "—"}
            </span>
          </div>
        </div>

        {canCancel ? (
          <div className="flex items-center gap-2 border-t pt-4">
            {canPause ? (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyCommandPending}
                  onClick={() =>
                    pauseMutation.mutate({ printerIpAddress: status.ipAddress })
                  }
                >
                  {pauseMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Pausing...
                    </>
                  ) : (
                    "Pause"
                  )}
                </Button>
                {pauseMutation.isPending && (
                  <p className="text-xs text-muted-foreground">
                    This can take up to 60 seconds.
                  </p>
                )}
              </div>
            ) : null}
            {canResume ? (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyCommandPending}
                  onClick={() =>
                    resumeMutation.mutate({
                      printerIpAddress: status.ipAddress,
                    })
                  }
                >
                  {resumeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resuming...
                    </>
                  ) : (
                    "Resume"
                  )}
                </Button>
                {resumeMutation.isPending && (
                  <p className="text-xs text-muted-foreground">
                    This can take up to 60 seconds.
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Button
                variant="destructive"
                size="sm"
                disabled={anyCommandPending}
                onClick={() =>
                  cancelMutation.mutate({ printerIpAddress: status.ipAddress })
                }
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Print"
                )}
              </Button>
              {cancelMutation.isPending && (
                <p className="text-xs text-muted-foreground">
                  This can take up to 60 seconds.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {status.webcamUrl ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-semibold">Camera</h4>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={cameraMode}
                  onValueChange={(value) => setCameraMode(value as CameraMode)}
                >
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snapshot">Snapshot</SelectItem>
                    <SelectItem value="stream">Live Stream</SelectItem>
                  </SelectContent>
                </Select>
                {cameraMode === "snapshot" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSnapshotTick((n) => n + 1)}
                  >
                    Refresh
                  </Button>
                ) : null}
              </div>
            </div>
            {cameraUrl ? (
              <div className="overflow-hidden rounded-lg border bg-black">
                <img
                  key={cameraUrl}
                  src={cameraUrl}
                  alt={`${status.printerName} camera`}
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border-t pt-4">
            No webcam URL configured for this printer.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PrintMonitoring() {
  const dashboardQuery = trpc.print.getLivePrinterStatuses.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const printers = useMemo(
    () =>
      (dashboardQuery.data ?? []).sort(
        (a, b) =>
          a.printerType.localeCompare(b.printerType) ||
          a.printerName.localeCompare(b.printerName),
      ),
    [dashboardQuery.data],
  );

  const [page, setPage] = useState(0);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(
    null,
  );

  const totalPages = Math.max(1, Math.ceil(printers.length / PAGE_SIZE));
  const pagedPrinters = printers.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const selectedPrinter =
    printers.find((p) => p.printerId === selectedPrinterId) ?? null;

  const hasAnyWebcam = printers.some((p) => p.webcamUrl);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Printer Monitoring</h1>
          <p className="text-muted-foreground">
            Overview of all printers. Click a printer for full telemetry and
            camera feed.
          </p>
        </div>
        {hasAnyWebcam ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = "/print-cam";
            }}
          >
            <Video className="mr-2 h-4 w-4" />
            View All Webcams
          </Button>
        ) : null}
      </div>

      {dashboardQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading printers...</p>
      ) : printers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No printers configured. Add printers via the Printer Management page.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedPrinters.map((printer) => (
              <PrinterCard
                key={printer.printerId}
                status={printer}
                onClick={() => setSelectedPrinterId(printer.printerId)}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      {selectedPrinter ? (
        <PrinterDetail
          status={selectedPrinter}
          onClose={() => setSelectedPrinterId(null)}
        />
      ) : null}
    </div>
  );
}
