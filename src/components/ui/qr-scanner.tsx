import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Camera, X, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "./alert";
import { BrowserMultiFormatReader } from "@zxing/library";

interface QRScannerProps {
  onScan: (result: string) => void;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null);

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
        (result, err) => {
          if (result) {
            const text = result.getText();

            // Debounce: ignore same code within 3 seconds
            const now = Date.now();
            if (
              lastScanRef.current?.text === text &&
              now - lastScanRef.current.ts < 3000
            )
              return;
            lastScanRef.current = { text, ts: now };

            onScan(text);

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
  }, [onScan, multiScan]);

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
      if (!open) stopCamera();
    },
    [stopCamera],
  );

  useEffect(() => {
    return () => {
      readerRef.current?.reset();
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
