import { useMemo, useState } from "react";
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

type CameraMode = "stream" | "snapshot";

const PAGE_SIZE = 12;

const buildProxyCameraUrl = (
  printerId: string,
  mode: CameraMode,
  snapshotTick: number,
): string => {
  const base = `/api/webcam/${encodeURIComponent(printerId)}`;
  if (mode === "snapshot") {
    return `${base}?mode=snapshot&_t=${snapshotTick}`;
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

// ─── Printer overview card (used in the grid) ─────────────────────────────────

function PrinterCard({
  printer,
  onClick,
  printedBy,
}: {
  printer: { id: string; name: string; type: string; ipAddress: string };
  onClick: () => void;
  printedBy: string | null;
}) {
  const statusQuery = trpc.print.getPrinterStatus.useQuery(
    { printerIpAddress: printer.ipAddress },
    { refetchInterval: 10_000 },
  );

  const data = statusQuery.data;
  const isLoading = statusQuery.isLoading;

  return (
    <Card
      className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 bg-card border-border/50"
      onClick={onClick}
    >
      {/* Top accent line based on status */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-colors duration-500 z-20 ${
          data ? statusColor(data.state) : "bg-border/50"
        }`}
      />

      <CardContent className="px-4 py-2 flex flex-col h-full gap-3 relative z-10 pt-2.5">
        {/* Header: Name, Type, Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0 space-y-1">
            <h3 className="font-bold text-base tracking-tight truncate group-hover:text-primary transition-colors">
              {printer.name}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border/50">
                {printer.type}
              </span>
              <span className="font-mono text-[10px] opacity-70">
                {printer.ipAddress}
              </span>
            </div>
          </div>
          {isLoading ? (
            <Badge variant="outline" className="animate-pulse shrink-0">
              Loading…
            </Badge>
          ) : data ? (
            <Badge
              variant={statusBadgeVariant(data.state)}
              className="shrink-0 pl-2 pr-3 py-1 shadow-sm transition-colors border-border/20"
            >
              <span
                className={`h-2 w-2 rounded-full mr-2 shadow-[0_0_8px_currentColor] ${statusColor(data.state)} ${["PRINTING", "BUSY"].includes(data.state.toUpperCase()) ? "animate-pulse" : ""}`}
              />
              <span className="uppercase text-[10px] tracking-wider font-bold">
                {data.stateMessage}
              </span>
            </Badge>
          ) : null}
        </div>

        {/* Main Metric & Progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Progress
              </span>
              <span className="text-3xl font-black tracking-tighter tabular-nums leading-none">
                {data?.progress != null ? `${data.progress.toFixed(1)}%` : "—"}
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Remaining
              </span>
              <span className="text-lg font-bold tabular-nums leading-none text-foreground/80">
                {data?.timeRemaining != null
                  ? formatDuration(data.timeRemaining)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/80 shadow-inner border border-border/40">
            <div
              className={`h-full transition-all duration-1000 ease-out rounded-full ${
                data ? statusColor(data.state) : "bg-primary"
              }`}
              style={{ width: `${data?.progress ?? 0}%` }}
            />
          </div>
        </div>

        {/* Printed by + File name footer */}
        <div className="mt-auto space-y-1.5">
          {printedBy ? (
            <div className="bg-primary/5 rounded-md px-2.5 py-1.5 border border-primary/20">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Printed by
              </span>
              <p className="text-sm font-semibold truncate text-foreground" title={printedBy}>
                {printedBy}
              </p>
            </div>
          ) : null}
          <div className="bg-secondary/30 rounded-md px-2.5 py-1.5 border border-border/50 transition-colors group-hover:bg-secondary/50">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
              Current File
            </span>
            <p
              className={`text-sm font-medium truncate ${!data?.fileName ? "text-muted-foreground/60 italic" : "text-foreground"}`}
              title={data?.fileName ?? undefined}
            >
              {data?.fileName ?? "No active print"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Printer detail dialog ────────────────────────────────────────────────────

function PrinterDetail({
  printer,
  onClose,
  printedBy,
}: {
  printer: {
    id: string;
    name: string;
    type: string;
    ipAddress: string;
    webcamUrl: string | null;
  };
  onClose: () => void;
  printedBy: string | null;
}) {
  const statusQuery = trpc.print.getPrinterStatus.useQuery(
    { printerIpAddress: printer.ipAddress },
    { refetchInterval: 10_000 },
  );

  const pauseMutation = trpc.print.pausePrint.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      void statusQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const resumeMutation = trpc.print.resumePrint.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      void statusQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = trpc.print.cancelPrint.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      void statusQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const [cameraMode, setCameraMode] = useState<CameraMode>("stream");
  const [snapshotTick, setSnapshotTick] = useState(0);

  const cameraUrl = useMemo(() => {
    if (!printer.webcamUrl) return null;
    return buildProxyCameraUrl(printer.id, cameraMode, snapshotTick);
  }, [cameraMode, printer.id, printer.webcamUrl, snapshotTick]);

  const data = statusQuery.data;
  const hasCamera = Boolean(printer.webcamUrl);
  const upperState = data?.state.toUpperCase() ?? "";
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
            {printer.name}
            <span className="text-sm font-normal text-muted-foreground">
              {printer.type} &bull; {printer.ipAddress}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Telemetry */}
        {statusQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading printer telemetry…
          </p>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Status */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${statusColor(data.state)}`}
                />
                <span className="font-semibold">{data.stateMessage}</span>
              </div>
            </div>

            {/* Nozzle */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Nozzle
              </span>
              <span className="font-semibold text-lg">
                {data.nozzleTemp != null ? data.nozzleTemp.toFixed(1) : "—"}°C /{" "}
                {data.targetNozzleTemp != null
                  ? data.targetNozzleTemp.toFixed(1)
                  : "—"}
                °C
              </span>
            </div>

            {/* Bed */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Bed
              </span>
              <span className="font-semibold text-lg">
                {data.bedTemp != null ? data.bedTemp.toFixed(1) : "—"}°C /{" "}
                {data.targetBedTemp != null
                  ? data.targetBedTemp.toFixed(1)
                  : "—"}
                °C
              </span>
            </div>

            {/* Chamber (conditional) */}
            {data.chamberTemp != null ? (
              <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Chamber
                </span>
                <span className="font-semibold text-lg">
                  {data.chamberTemp.toFixed(1)}°C
                </span>
              </div>
            ) : null}

            {/* Progress */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card col-span-2 md:col-span-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Progress
              </span>
              <div className="flex flex-col gap-2 mt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${data.progress ?? 0}%` }}
                  />
                </div>
                <span className="font-semibold text-sm">
                  {data.progress != null ? `${data.progress.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>

            {/* Time Remaining */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Time Remaining
              </span>
              <span className="font-semibold text-lg">
                {data.timeRemaining != null
                  ? formatDuration(data.timeRemaining)
                  : "—"}
              </span>
            </div>

            {/* Time Printing */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Time Printing
              </span>
              <span className="font-semibold text-lg">
                {data.timePrinting != null
                  ? formatDuration(data.timePrinting)
                  : "—"}
              </span>
            </div>

            {/* File Name */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card md:col-span-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                File Name
              </span>
              <span
                className="font-semibold truncate"
                title={data.fileName ?? undefined}
              >
                {data.fileName ?? "—"}
              </span>
            </div>

            {/* Filament */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Filament
              </span>
              <span className="font-semibold">{data.filamentType ?? "—"}</span>
            </div>

            {/* Printed By */}
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Printed By
              </span>
              <span className="font-semibold truncate" title={printedBy ?? undefined}>
                {printedBy ?? "—"}
              </span>
            </div>
          </div>
        ) : null}

        {/* Print Controls */}
        {canCancel ? (
          <div className="flex items-center gap-2 border-t pt-4">
            {canPause ? (
              <Button
                variant="outline"
                size="sm"
                disabled={anyCommandPending}
                onClick={() =>
                  pauseMutation.mutate({
                    printerIpAddress: printer.ipAddress,
                  })
                }
              >
                {pauseMutation.isPending ? "Pausing…" : "Pause"}
              </Button>
            ) : null}
            {canResume ? (
              <Button
                variant="outline"
                size="sm"
                disabled={anyCommandPending}
                onClick={() =>
                  resumeMutation.mutate({
                    printerIpAddress: printer.ipAddress,
                  })
                }
              >
                {resumeMutation.isPending ? "Resuming…" : "Resume"}
              </Button>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              disabled={anyCommandPending}
              onClick={() =>
                cancelMutation.mutate({
                  printerIpAddress: printer.ipAddress,
                })
              }
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel Print"}
            </Button>
          </div>
        ) : null}
        {/* Camera */}
        {hasCamera ? (
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
                    <SelectItem value="stream">Live Stream</SelectItem>
                    <SelectItem value="snapshot">Snapshot</SelectItem>
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
                  src={cameraUrl}
                  alt={`${printer.name} camera`}
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
  const printersQuery = trpc.print.getPrinterMonitoringOptions.useQuery();
  const activePrintsQuery = trpc.print.getActivePrints.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  // Build a lookup: ipAddress -> user name who started the print
  const printedByMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ap of activePrintsQuery.data ?? []) {
      if (ap.startedBy) {
        map.set(ap.ipAddress, ap.startedBy.name);
      }
    }
    return map;
  }, [activePrintsQuery.data]);

  const [page, setPage] = useState(0);
  const [selectedPrinterIp, setSelectedPrinterIp] = useState<string | null>(
    null,
  );

  const printers = printersQuery.data ?? [];
  const totalPages = Math.max(1, Math.ceil(printers.length / PAGE_SIZE));
  const pagedPrinters = printers.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const selectedPrinter =
    printers.find((p) => p.ipAddress === selectedPrinterIp) ?? null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Printer Monitoring</h1>
        <p className="text-muted-foreground">
          Overview of all printers. Click a printer for full telemetry and
          camera feed.
        </p>
      </div>

      {printersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading printers…</p>
      ) : printers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No printers configured. Add printers via the Printer Management page.
        </p>
      ) : (
        <>
          {/* Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedPrinters.map((printer) => (
              <PrinterCard
                key={printer.id}
                printer={printer}
                onClick={() => setSelectedPrinterIp(printer.ipAddress)}
                printedBy={printedByMap.get(printer.ipAddress) ?? null}
              />
            ))}
          </div>

          {/* Pagination */}
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

      {/* Detail dialog */}
      {selectedPrinter ? (
        <PrinterDetail
          printer={selectedPrinter}
          onClose={() => setSelectedPrinterIp(null)}
          printedBy={printedByMap.get(selectedPrinter.ipAddress) ?? null}
        />
      ) : null}
    </div>
  );
}
