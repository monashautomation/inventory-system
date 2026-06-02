import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { AlertCircle, Camera, CheckCircle2, Info, X } from "lucide-react";
import { Alert, AlertDescription } from "./alert";
import { BrowserMultiFormatReader } from "@zxing/library";

export type ScanFeedback = {
  type: "success" | "error" | "info";
  title: string;
  message: string;
} | null;

interface QRScannerProps {
  onScan: (
    result: string,
  ) => Promise<ScanFeedback | void> | ScanFeedback | void;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  disabled?: boolean;
  /** Keep dialog open and camera running after each scan */
  multiScan?: boolean;
}

export function QRScanner({
  onScan,
  trigger,
  title = "Scan QR Code",
  description = "Position the QR code within the camera view to scan",
  disabled = false,
  multiScan = false,
}: QRScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null);
  const [flashType, setFlashType] = useState<"success" | "error" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showScanFeedback = useCallback(
    (feedback: NonNullable<ScanFeedback>) => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setScanFeedback(feedback);
      if (feedback.type !== "info") setFlashType(feedback.type);
      feedbackTimerRef.current = setTimeout(() => {
        setScanFeedback(null);
        setFlashType(null);
      }, 2000);
    },
    [],
  );

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setIsScanning(true);

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const videoInputDevices = await reader.listVideoInputDevices();
      if (videoInputDevices.length === 0) {
        throw new Error("No camera devices found");
      }

      await reader.decodeFromVideoDevice(
        videoInputDevices[0].deviceId,
        videoRef.current,
        async (result, err) => {
          if (result) {
            const text = result.getText();

            const now = Date.now();
            if (
              lastScanRef.current?.text === text &&
              now - lastScanRef.current.ts < 3000
            )
              return;
            lastScanRef.current = { text, ts: now };

            const feedback = await onScan(text);
            if (feedback) showScanFeedback(feedback);

            if (!multiScan) {
              stopCamera();
              setIsOpen(false);
            }
          }
          if (
            err &&
            err.name !== "NotFoundException" &&
            err.name !== "NotFoundException2"
          ) {
            console.warn("QR decode error:", err.name, err.message);
          }
        },
      );
    } catch {
      setError(
        "Unable to access camera. Please check permissions and try again.",
      );
      setIsScanning(false);
    }
  }, [onScan, multiScan, showScanFeedback]);

  const stopCamera = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        stopCamera();
        setScanFeedback(null);
        setFlashType(null);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      }
    },
    [stopCamera],
  );

  useEffect(() => {
    return () => {
      readerRef.current?.reset();
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const defaultTrigger = (
    <Button disabled={disabled} variant="outline" size="sm">
      <Camera className="w-4 h-4 mr-2" />
      Scan QR
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="relative">
            <div className="aspect-square w-full max-w-sm mx-auto bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ display: isScanning ? "block" : "none" }}
              />
              {!isScanning && (
                <div className="w-full h-full flex items-center justify-center text-white">
                  <div className="text-center">
                    <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Camera not active</p>
                  </div>
                </div>
              )}
              {flashType && (
                <div
                  key={flashType + String(scanFeedback?.message)}
                  className={`absolute inset-0 pointer-events-none animate-[flash_0.4s_ease-out_forwards] ${
                    flashType === "success"
                      ? "bg-green-500/40"
                      : "bg-red-500/40"
                  }`}
                />
              )}
            </div>

            {isScanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-4 border-2 border-primary rounded-lg">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
                </div>
              </div>
            )}
          </div>

          {scanFeedback && (
            <div
              className={`rounded-xl px-4 py-3 flex items-start gap-3 border transition-all ${
                scanFeedback.type === "success"
                  ? "bg-green-50 border-green-300 dark:bg-green-950/40 dark:border-green-800"
                  : scanFeedback.type === "error"
                    ? "bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800"
                    : "bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-800"
              }`}
            >
              {scanFeedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : scanFeedback.type === "error" ? (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p
                  className={`font-semibold text-sm ${
                    scanFeedback.type === "success"
                      ? "text-green-800 dark:text-green-300"
                      : scanFeedback.type === "error"
                        ? "text-red-800 dark:text-red-300"
                        : "text-blue-800 dark:text-blue-300"
                  }`}
                >
                  {scanFeedback.title}
                </p>
                <p
                  className={`text-sm mt-0.5 ${
                    scanFeedback.type === "success"
                      ? "text-green-700 dark:text-green-400"
                      : scanFeedback.type === "error"
                        ? "text-red-700 dark:text-red-400"
                        : "text-blue-700 dark:text-blue-400"
                  }`}
                >
                  {scanFeedback.message}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!isScanning ? (
              <Button onClick={startCamera} className="flex-1">
                <Camera className="w-4 h-4 mr-2" />
                Start Camera
              </Button>
            ) : (
              <Button onClick={stopCamera} variant="outline" className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Stop Camera
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
