import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRScanner } from "@/components/ui/qr-scanner";
import { parseQrItemId } from "@/lib/qr";

/**
 * Opens the camera and goes straight to the scanned item's page, where the
 * state-aware action (Check out / Check in) is one tap away. Pass the button
 * or tab that should open the scanner as `children`.
 */
export function ScanItemButton({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <QRScanner
      title="Scan item"
      description="Point the camera at an item's QR label to open it."
      trigger={children as React.ReactElement}
      onScan={(text) => {
        const id = parseQrItemId(text);
        if (!id) {
          toast.error("That isn't an item QR code. Try again.");
          return;
        }
        void navigate(`/item/${id}`);
      }}
    />
  );
}
