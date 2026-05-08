import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useKiosk } from "@/contexts/kiosk-context";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Loader2,
  PackagePlus,
  Trash2,
  X,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/library";

interface ScannedItem {
  id: string;
  name: string;
  serial: string;
}

export default function KioskCheckout() {
  const { session, resetTimeout } = useKiosk();
  const navigate = useNavigate();
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ id: string; ts: number } | null>(null);
  // Ref tracks scanned IDs to avoid stale closure in scan callback
  const scannedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) void navigate("/kiosk", { replace: true });
    return () => stopCamera();
  }, [session, navigate]);

  const utils = trpc.useUtils();

  const getItem = trpc.kiosk.getItemByQR.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const checkout = trpc.kiosk.checkoutItems.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        void utils.kiosk.getUserLoanedItems.invalidate();
        toast.success("Items checked out successfully");
        void navigate("/kiosk/home");
      } else {
        toast.error(
          typeof data.failures === "string"
            ? data.failures
            : "Some items could not be checked out",
        );
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const stopCamera = () => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setScanning(false);
  };

  const startCamera = useCallback(async () => {
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await reader.listVideoInputDevices();
      if (!devices.length) throw new Error("No camera found");
      setScanning(true);
      await reader.decodeFromVideoDevice(
        devices[0].deviceId,
        videoRef.current,
        async (result, err) => {
          if (!result) return;
          if (
            err &&
            err.name !== "NotFoundException" &&
            err.name !== "NotFoundException2"
          )
            return;

          const qrData = result.getText();
          const segments = qrData.trim().split("/");
          const qrIndex = segments.indexOf("qr");
          const itemId =
            qrIndex !== -1
              ? (segments[qrIndex + 1] ?? "")
              : (segments[segments.length - 1] ?? "");

          if (!itemId) return;

          // Debounce: ignore same item within 3 seconds
          const now = Date.now();
          if (
            lastScanRef.current?.id === itemId &&
            now - lastScanRef.current.ts < 3000
          )
            return;
          lastScanRef.current = { id: itemId, ts: now };

          // Claim the slot synchronously before awaiting to prevent TOCTOU race
          if (scannedIdsRef.current.has(itemId)) {
            toast.info("Item already in list");
            return;
          }
          scannedIdsRef.current.add(itemId);

          try {
            const item = await getItem.mutateAsync({ qrData });
            if (!item) {
              scannedIdsRef.current.delete(itemId);
              return;
            }

            const latestRecord = item.ItemRecords[0];
            if (latestRecord?.loaned) {
              scannedIdsRef.current.delete(itemId);
              toast.error(`${item.name} is already on loan`);
              return;
            }

            if (!item.consumable && item.stored === false) {
              scannedIdsRef.current.delete(itemId);
              toast.error(`${item.name} is marked as Lab Use only`);
              return;
            }

            if (item.consumable && (item.consumable.available ?? 0) <= 0) {
              scannedIdsRef.current.delete(itemId);
              toast.error(`${item.name} is out of stock`);
              return;
            }

            resetTimeout();
            setItems((prev) => [
              ...prev,
              { id: item.id, name: item.name, serial: item.serial },
            ]);
            toast.success(`Added: ${item.name}`);
          } catch {
            scannedIdsRef.current.delete(itemId);
            // error handled by mutation
          }
        },
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start camera",
      );
      setScanning(false);
    }
  }, [getItem]);

  const removeItem = (id: string) => {
    scannedIdsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleConfirm = () => {
    if (!session || items.length === 0) return;
    checkout.mutate({
      studentId: session.student.studentId,
      itemIds: items.map((i) => i.id),
    });
  };

  if (!session) return null;

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => {
            stopCamera();
            void navigate("/kiosk/home");
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <PackagePlus className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-base font-semibold truncate">Check Out Items</h1>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary" className="ml-auto shrink-0">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Camera panel */}
        <div className="md:w-1/2 flex flex-col gap-3 p-4 md:p-6 md:border-r shrink-0 md:overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Scan QR codes — camera stays open to add multiple items
          </p>
          <div className="relative bg-black rounded-xl overflow-hidden w-full aspect-[4/3] md:aspect-square md:max-w-sm md:mx-auto">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: scanning ? "block" : "none" }}
            />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center space-y-3">
                  <Camera className="w-10 h-10 mx-auto opacity-40" />
                  <p className="text-sm opacity-60">Camera not active</p>
                </div>
              </div>
            )}
            {scanning && (
              <div className="absolute inset-6 pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-sm" />
              </div>
            )}
          </div>
          {!scanning ? (
            <Button
              onClick={startCamera}
              className="w-full md:max-w-sm md:mx-auto"
            >
              <Camera className="w-4 h-4 mr-2" />
              Start Scanning
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={stopCamera}
              className="w-full md:max-w-sm md:mx-auto"
            >
              <X className="w-4 h-4 mr-2" />
              Stop Camera
            </Button>
          )}
        </div>

        {/* Item list panel */}
        <div className="flex-1 flex flex-col min-h-0 md:w-1/2">
          <div className="px-4 pt-3 pb-2 md:px-6 md:pt-6 shrink-0">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Scanned Items
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-2">
            {items.length === 0 ? (
              <div className="h-full min-h-[80px] flex items-center justify-center border border-dashed rounded-lg p-6">
                <p className="text-sm text-muted-foreground text-center">
                  No items scanned yet.
                  <br />
                  Start the camera and scan a QR code.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card"
                  >
                    <div className="min-w-0 mr-2">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.serial}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sticky confirm */}
          <div className="px-4 py-3 md:px-6 md:pb-6 border-t shrink-0">
            <Button
              className="w-full h-12 text-base"
              disabled={items.length === 0 || checkout.isPending}
              onClick={handleConfirm}
            >
              {checkout.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : items.length === 0 ? (
                "Scan items to check out"
              ) : (
                `Check Out ${items.length} Item${items.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
