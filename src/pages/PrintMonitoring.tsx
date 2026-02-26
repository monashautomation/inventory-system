import { useMemo, useState } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type CameraMode = "stream" | "snapshot";

const buildSnapshotUrl = (webcamUrl: string) => {
  if (webcamUrl.includes("action=stream")) {
    return webcamUrl.replace("action=stream", "action=snapshot");
  }
  return webcamUrl;
};
const formatDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};


export default function PrintMonitoring() {
  const printersQuery = trpc.print.getPrinterMonitoringOptions.useQuery();
  const [selectedPrinterIp, setSelectedPrinterIp] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("stream");
  const [snapshotTick, setSnapshotTick] = useState(0);

  const printers = printersQuery.data ?? [];
  const selectedPrinter =
    printers.find((printer) => printer.ipAddress === selectedPrinterIp) ?? null;

  const statusQuery = trpc.print.getPrinterStatus.useQuery(
    { printerIpAddress: selectedPrinterIp },
    { enabled: !!selectedPrinterIp, refetchInterval: 10_000 },
  );
  const cameraUrl = useMemo(() => {
    if (!selectedPrinter?.webcamUrl) return null;
    if (cameraMode === "stream") return selectedPrinter.webcamUrl;
    const snapshotUrl = buildSnapshotUrl(selectedPrinter.webcamUrl);
    const separator = snapshotUrl.includes("?") ? "&" : "?";
    return `${snapshotUrl}${separator}_t=${snapshotTick}`;
  }, [cameraMode, selectedPrinter, snapshotTick]);

  const hasCamera = Boolean(selectedPrinter?.webcamUrl);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Printer Monitoring</h1>
        <p className="text-muted-foreground">
          Select a printer and camera mode to view the live webcam feed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Camera Viewer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Printer</Label>
              <Select value={selectedPrinterIp} onValueChange={setSelectedPrinterIp}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a printer" />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((printer) => (
                    <SelectItem value={printer.ipAddress} key={printer.id}>
                      {printer.name} ({printer.type}) - {printer.ipAddress}
                      {!printer.webcamUrl ? " [No camera]" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Camera Option</Label>
              <Select
                value={cameraMode}
                onValueChange={(value) => setCameraMode(value as CameraMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stream">Live Stream</SelectItem>
                  <SelectItem value="snapshot">Snapshot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedPrinter ? (
            <p className="text-sm text-muted-foreground">
              Select a printer to view its camera feed.
            </p>
          ) : !hasCamera ? (
            <p className="text-sm text-muted-foreground">
              No webcam URL configured for this printer. An admin can add one via the Add Printer dialog on the G-code Printing page.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {selectedPrinter.name} ({selectedPrinter.type})
                </span>
                <span>•</span>
                <span>{cameraMode === "stream" ? "Live stream" : "Snapshot"}</span>
              </div>

              {cameraMode === "snapshot" ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSnapshotTick((n) => n + 1)}
                  >
                    Refresh Snapshot
                  </Button>
                  {cameraUrl ? (
                    <a href={cameraUrl} target="_blank" rel="noreferrer">
                      <Button type="button" variant="outline">
                        Open Camera URL
                      </Button>
                    </a>
                  ) : null}
                </div>
              ) : (
                <div>
                  {cameraUrl ? (
                    <a href={cameraUrl} target="_blank" rel="noreferrer">
                      <Button type="button" variant="outline">
                        Open Stream URL
                      </Button>
                    </a>
                  ) : null}
                </div>
              )}

              {cameraUrl ? (
                <div className="overflow-hidden rounded-lg border bg-black">
                  <img
                    src={cameraUrl}
                    alt={`${selectedPrinter.name} camera`}
                    className="h-auto w-full object-contain"
                  />
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPrinter ? (
        <Card>
          <CardHeader>
            <CardTitle>Printer Telemetry</CardTitle>
          </CardHeader>
          <CardContent>
            {statusQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading printer telemetry…</p>
            ) : statusQuery.data ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      ["PRINTING", "PAUSED", "BUSY"].includes(statusQuery.data.state.toUpperCase())
                        ? "bg-yellow-500"
                        : ["ATTENTION", "UNREACHABLE"].includes(statusQuery.data.state.toUpperCase())
                          ? "bg-red-500"
                          : ["IDLE", "READY", "FINISHED"].includes(statusQuery.data.state.toUpperCase())
                            ? "bg-green-500"
                            : "bg-muted-foreground"
                    }`} />
                    <span className="font-semibold">{statusQuery.data.stateMessage}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nozzle</span>
                  <span className="font-semibold text-lg">
                    {statusQuery.data.nozzleTemp != null ? statusQuery.data.nozzleTemp.toFixed(1) : "—"}°C / {statusQuery.data.targetNozzleTemp != null ? statusQuery.data.targetNozzleTemp.toFixed(1) : "—"}°C
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bed</span>
                  <span className="font-semibold text-lg">
                    {statusQuery.data.bedTemp != null ? statusQuery.data.bedTemp.toFixed(1) : "—"}°C / {statusQuery.data.targetBedTemp != null ? statusQuery.data.targetBedTemp.toFixed(1) : "—"}°C
                  </span>
                </div>

                {statusQuery.data.chamberTemp != null ? (
                  <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chamber</span>
                    <span className="font-semibold text-lg">
                      {statusQuery.data.chamberTemp.toFixed(1)}°C
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card col-span-2 md:col-span-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Progress</span>
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div 
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${statusQuery.data.progress ?? 0}%` }}
                      />
                    </div>
                    <span className="font-semibold text-sm">{statusQuery.data.progress != null ? `${statusQuery.data.progress.toFixed(1)}%` : "—"}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Time Remaining</span>
                  <span className="font-semibold text-lg">
                    {statusQuery.data.timeRemaining != null ? formatDuration(statusQuery.data.timeRemaining) : "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Time Printing</span>
                  <span className="font-semibold text-lg">
                    {statusQuery.data.timePrinting != null ? formatDuration(statusQuery.data.timePrinting) : "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card md:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Name</span>
                  <span className="font-semibold truncate" title={statusQuery.data.fileName ?? undefined}>
                    {statusQuery.data.fileName ?? "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filament</span>
                  <span className="font-semibold">
                    {statusQuery.data.filamentType ?? "—"}
                  </span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
