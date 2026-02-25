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

export default function PrintMonitoring() {
  const printersQuery = trpc.print.getPrinterMonitoringOptions.useQuery();
  const [selectedPrinterIp, setSelectedPrinterIp] = useState("");
  const [cameraMode, setCameraMode] = useState<CameraMode>("stream");
  const [snapshotTick, setSnapshotTick] = useState(0);

  const printers = printersQuery.data ?? [];
  const selectedPrinter =
    printers.find((printer) => printer.ipAddress === selectedPrinterIp) ?? null;

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
              No `webcamUrl` configured for this printer in `config/printers.local.json`.
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
    </div>
  );
}
