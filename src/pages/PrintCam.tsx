import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { VideoOff } from "lucide-react";
import logoHorizontal from "@/assets/Logo_Text_Horizontal.png";

interface PrinterCamData {
  printerId: string;
  printerName: string;
  printerType: string;
  ipAddress: string;
  webcamUrl: string | null;
  state: string;
  stateMessage: string;
  nozzleTemp: number | null;
  targetNozzleTemp: number | null;
  bedTemp: number | null;
  targetBedTemp: number | null;
  chamberTemp: number | null;
  progress: number | null;
  timeRemaining: number | null;
  filamentType: string | null;
  fileName: string | null;
  updatedAt: number;
  startedBy: { name: string; email: string } | null;
  jobStartedAt: Date | null;
}

const TILE_GAP = 10;
const MIN_DESKTOP_WIDTH = 768;

const buildCachedSnapshotUrl = (printerId: string, tick: number): string =>
  `/api/webcam/${encodeURIComponent(printerId)}?mode=cached_snapshot&_t=${tick}`;

function computeLayout(
  count: number,
  availableW: number,
  availableH: number,
): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = (availableW - TILE_GAP * (cols - 1)) / cols;
    const tileH = tileW * (9 / 16);
    const totalH = tileH * rows + TILE_GAP * (rows - 1);
    if (totalH <= availableH) return { cols, rows };
  }
  return { cols: count, rows: 1 };
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusAccentColor(state: string): string {
  const s = state.toUpperCase();
  if (["PRINTING", "BUSY"].includes(s)) return "#facc15";
  if (["PAUSED"].includes(s)) return "#fb923c";
  if (["ATTENTION", "UNREACHABLE"].includes(s)) return "#f87171";
  if (["IDLE", "READY", "FINISHED"].includes(s)) return "#4ade80";
  return "#71717a";
}

function statusLabel(state: string, stateMessage: string): string {
  const s = state.toUpperCase();
  if (s === "CONNECTING") return "Connecting…";
  if (s === "UNKNOWN") return "Unknown";
  return stateMessage;
}

function WebcamTile({
  data,
  globalTick,
  tileHeight,
  paused,
  onUnavailable,
  onAvailable,
}: {
  data: PrinterCamData;
  globalTick: number;
  tileHeight: number;
  paused: boolean;
  onUnavailable?: () => void;
  onAvailable?: () => void;
}) {
  const [localTick, setLocalTick] = useState(0);
  const [imgError, setImgError] = useState(false);
  const tick = globalTick + localTick;

  // Reset error state when tick changes so click-to-refresh retries
  useEffect(() => {
    setImgError(false);
  }, [tick]);

  const handleImgError = useCallback(() => {
    setImgError(true);
    onUnavailable?.();
  }, [onUnavailable]);

  const handleImgLoad = useCallback(() => {
    onAvailable?.();
  }, [onAvailable]);

  // Null src while paused — browser aborts in-flight request, freeing the
  // connection slot for the tRPC refetch that triggered the pause.
  const imgSrc =
    !paused && data.webcamUrl
      ? buildCachedSnapshotUrl(data.printerId, tick)
      : null;

  const accentColor = statusAccentColor(data.state);
  const isPrinting = data.state.toUpperCase() === "PRINTING";
  const isPaused = data.state.toUpperCase() === "PAUSED";
  const showProgress = data.progress != null && (isPrinting || isPaused);

  const scale = Math.min(1, tileHeight / 220);
  const fontSize = Math.max(8, Math.round(11 * scale));
  const smallFontSize = Math.max(7, Math.round(9 * scale));
  const overlayPadding = Math.max(4, Math.round(8 * scale));

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/10 bg-black cursor-pointer group"
      style={{ height: tileHeight }}
      onClick={() => setLocalTick((n) => n + 1)}
    >
      {/* Status accent bar at top */}
      <div
        className="absolute top-0 inset-x-0 z-20 transition-colors duration-500"
        style={{
          height: Math.max(2, Math.round(3 * scale)),
          backgroundColor: accentColor,
        }}
      />

      {/* Webcam feed */}
      {!imgSrc || imgError ? (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-zinc-900">
          <VideoOff
            className="text-zinc-500"
            style={{
              width: Math.max(20, Math.round(36 * scale)),
              height: Math.max(20, Math.round(36 * scale)),
            }}
          />
          <span
            className="text-zinc-500 font-medium text-center leading-tight px-2"
            style={{ fontSize }}
          >
            {!imgSrc ? "No webcam configured" : "Webcam unavailable"}
          </span>
        </div>
      ) : (
        <img
          key={`${data.printerId}-${tick}`}
          src={imgSrc}
          alt={`${data.printerName} camera`}
          className="h-full w-full object-contain"
          onError={handleImgError}
          onLoad={handleImgLoad}
        />
      )}

      {/* Bottom gradient overlay */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 55%, transparent 100%)",
          padding: overlayPadding,
          paddingTop: overlayPadding * 3,
          gap: Math.max(2, Math.round(4 * scale)),
        }}
      >
        <div
          className="flex items-center justify-between gap-1"
          style={{ gap: Math.max(3, Math.round(6 * scale)) }}
        >
          <div className="flex flex-col min-w-0">
            <span
              className="text-white font-bold truncate leading-tight"
              style={{ fontSize }}
            >
              {data.printerName}
            </span>
            {data.startedBy && (
              <span
                className="text-white/50 truncate leading-tight"
                style={{ fontSize: smallFontSize }}
              >
                {data.startedBy.name}
              </span>
            )}
          </div>
          <span
            className="shrink-0 rounded-full font-semibold uppercase tracking-wide leading-none whitespace-nowrap"
            style={{
              fontSize: smallFontSize,
              color: accentColor,
              paddingLeft: Math.max(3, Math.round(5 * scale)),
              paddingRight: Math.max(3, Math.round(5 * scale)),
              paddingTop: Math.max(1, Math.round(2 * scale)),
              paddingBottom: Math.max(1, Math.round(2 * scale)),
              backgroundColor: `${accentColor}22`,
              border: `1px solid ${accentColor}55`,
            }}
          >
            {statusLabel(data.state, data.stateMessage)}
          </span>
        </div>

        {showProgress && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: Math.max(2, Math.round(3 * scale)),
            }}
          >
            <div
              className="w-full overflow-hidden rounded-full"
              style={{
                height: Math.max(2, Math.round(4 * scale)),
                backgroundColor: "rgba(255,255,255,0.15)",
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${data.progress ?? 0}%`,
                  backgroundColor: accentColor,
                }}
              />
            </div>
            <div
              className="flex items-center justify-between text-white/70 leading-none"
              style={{ fontSize: smallFontSize }}
            >
              <span className="font-semibold text-white">
                {data.progress!.toFixed(1)}%
              </span>
              {data.timeRemaining != null && (
                <span>{formatDuration(data.timeRemaining)} left</span>
              )}
            </div>
          </div>
        )}

        <div
          className="flex items-center flex-wrap text-white/55 leading-none"
          style={{
            fontSize: smallFontSize,
            gap: Math.max(4, Math.round(8 * scale)),
          }}
        >
          {data.nozzleTemp != null && (
            <span>
              <span className="text-white/40 mr-0.5">N</span>
              <span className="text-white/75">
                {data.nozzleTemp.toFixed(0)}°
              </span>
              {data.targetNozzleTemp != null && data.targetNozzleTemp > 0 && (
                <span>/{data.targetNozzleTemp.toFixed(0)}°</span>
              )}
            </span>
          )}
          {data.bedTemp != null && (
            <span>
              <span className="text-white/40 mr-0.5">B</span>
              <span className="text-white/75">{data.bedTemp.toFixed(0)}°</span>
              {data.targetBedTemp != null && data.targetBedTemp > 0 && (
                <span>/{data.targetBedTemp.toFixed(0)}°</span>
              )}
            </span>
          )}
          {data.filamentType && (
            <span
              className="font-semibold rounded"
              style={{ color: accentColor, opacity: 0.9 }}
            >
              {data.filamentType}
            </span>
          )}
        </div>
      </div>

      <div
        className="absolute inset-0 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
      >
        <span
          className="text-white/70 font-medium tracking-wide"
          style={{ fontSize: smallFontSize }}
        >
          click to refresh
        </span>
      </div>
    </div>
  );
}

export default function PrintCam() {
  const { setOpen } = useSidebar();
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [globalTick, setGlobalTick] = useState(0);
  const [webcamPaused, setWebcamPaused] = useState(false);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOpen(false);
    return () => {
      setOpen(true);
    };
  }, [setOpen]);

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clear unavailable set on each tick so tiles retry after every refresh cycle
  useEffect(() => {
    setUnavailableIds(new Set());
  }, [globalTick]);

  const markUnavailable = useCallback((id: string) => {
    setUnavailableIds((prev) => new Set([...prev, id]));
  }, []);

  const markAvailable = useCallback((id: string) => {
    setUnavailableIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const refreshMutation = trpc.print.refreshPrintCamCache.useMutation();

  // staleTime=Infinity so React Query never auto-refetches; we drive the
  // interval manually below so we can pre-emptively kill webcam connections
  // before the fetch fires rather than reacting after isFetching=true.
  const dashboardQuery = trpc.print.getPrintCamDashboard.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Hold a stable ref to refetch so the interval closure is always current.
  const refetchRef = useRef(dashboardQuery.refetch);
  refetchRef.current = dashboardQuery.refetch;

  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. Kill all webcam img requests so browser frees connection slots.
      setWebcamPaused(true);
      // 2. Wait one task to let the browser process the DOM change and cancel
      //    in-flight requests before we open a new HTTP connection for tRPC.
      await new Promise<void>((r) => setTimeout(r, 300));
      // 3. Fetch with an empty connection pool — guaranteed slot.
      // Race against a 10 s safety net so webcams never stay paused forever
      // if the server is unexpectedly slow.
      try {
        await Promise.race([
          refetchRef.current(),
          new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
        ]);
      } finally {
        // 4. Resume webcams and bump tick so all tiles reload snapshots.
        setWebcamPaused(false);
        setGlobalTick((n) => n + 1);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    setWebcamPaused(true);
    await new Promise<void>((r) => setTimeout(r, 300));
    try {
      await Promise.race([
        refetchRef.current(),
        new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
      ]);
      refreshMutation.mutate();
    } finally {
      setWebcamPaused(false);
      setGlobalTick((n) => n + 1);
    }
  }, [refreshMutation]);

  const webcamPrinters = useMemo(
    () =>
      (dashboardQuery.data ?? [])
        .filter((p) => p.webcamUrl)
        .sort(
          (a, b) =>
            a.printerType.localeCompare(b.printerType) ||
            a.printerName.localeCompare(b.printerName),
        ),
    [dashboardQuery.data],
  );

  const visiblePrinters = useMemo(
    () => webcamPrinters.filter((p) => !unavailableIds.has(p.printerId)),
    [webcamPrinters, unavailableIds],
  );

  const isMobile = containerSize.w > 0 && containerSize.w < MIN_DESKTOP_WIDTH;

  const { cols, rows } = useMemo(() => {
    if (
      visiblePrinters.length === 0 ||
      containerSize.w === 0 ||
      containerSize.h === 0
    ) {
      return { cols: 1, rows: 1 };
    }
    return computeLayout(
      visiblePrinters.length,
      containerSize.w,
      containerSize.h,
    );
  }, [visiblePrinters.length, containerSize]);

  const tileHeight = useMemo(() => {
    if (rows === 0 || containerSize.h === 0) return 200;
    return (containerSize.h - TILE_GAP * (rows - 1)) / rows;
  }, [rows, containerSize.h]);

  return (
    <div
      className="relative flex flex-col"
      style={{ height: "calc(100vh - 2rem)" }}
    >
      <div className="flex items-center justify-between gap-4 mb-3 shrink-0">
        <div className="flex flex-col justify-center" style={{ minHeight: 0 }}>
          <img
            src={logoHorizontal}
            alt="Monash Automation"
            className="h-8 w-auto object-contain object-left"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            3D printer monitoring · live snapshots
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshMutation.isPending}
          >
            Refresh All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = "/print-monitor";
            }}
          >
            ← Back
          </Button>
        </div>
      </div>

      <div ref={gridContainerRef} className="flex-1 min-h-0 overflow-hidden">
        {dashboardQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading webcams…</p>
        ) : dashboardQuery.isError ? (
          <p className="text-sm text-red-500">
            Failed to load printer data: {dashboardQuery.error.message}
          </p>
        ) : webcamPrinters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No printers have a webcam URL configured.
          </p>
        ) : isMobile ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-muted-foreground text-sm max-w-xs">
              This page is intended for desktop view. Please open it on a larger
              screen.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: `${TILE_GAP}px`,
              height: "100%",
              alignContent: "start",
            }}
          >
            {visiblePrinters.map((printer) => (
              <WebcamTile
                key={printer.printerId}
                data={printer}
                globalTick={globalTick}
                tileHeight={tileHeight}
                paused={webcamPaused}
                onUnavailable={() => markUnavailable(printer.printerId)}
                onAvailable={() => markAvailable(printer.printerId)}
              />
            ))}
          </div>
        )}
      </div>

      {unavailableIds.size > 0 && (
        <p className="shrink-0 mt-2 text-xs text-zinc-500 text-right">
          {unavailableIds.size}{" "}
          {unavailableIds.size === 1 ? "camera needs" : "cameras need"}{" "}
          attention
        </p>
      )}
    </div>
  );
}
