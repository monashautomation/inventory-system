import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useKiosk } from "@/contexts/kiosk-context";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Package,
  PackageCheck,
  QrCode,
} from "lucide-react";
import { QRScanner } from "@/components/ui/qr-scanner";

export default function KioskCheckin() {
  const { session, resetTimeout } = useKiosk();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) void navigate("/kiosk", { replace: true });
  }, [session, navigate]);

  const { data: loanedItems, isLoading } =
    trpc.kiosk.getUserLoanedItems.useQuery(
      { studentId: session?.student.studentId ?? "" },
      { enabled: !!session },
    );

  const utils = trpc.useUtils();

  const getItem = trpc.kiosk.getItemByQR.useMutation();

  const checkin = trpc.kiosk.checkinItems.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        void utils.kiosk.getUserLoanedItems.invalidate();
        toast.success("Items checked in successfully");
        void navigate("/kiosk/home");
      } else {
        toast.error(
          typeof data.failures === "string"
            ? data.failures
            : "Some items could not be checked in",
        );
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleItem = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleQRScan = async (qrData: string) => {
    try {
      const item = await getItem.mutateAsync({ qrData });
      if (!item) return;

      const loaned = loanedItems?.find((r) => r.itemId === item.id);
      if (!loaned) {
        toast.error(`${item.name} is not in your loaned items`);
        return;
      }

      if (selectedIds.has(item.id)) {
        toast.info(`${item.name} already selected`);
        return;
      }

      resetTimeout();
      setSelectedIds((prev) => new Set(prev).add(item.id));
      toast.success(`Selected: ${item.name}`);
    } catch (err) {
      if (err instanceof Error) toast.error(err.message);
    }
  };

  const handleConfirm = () => {
    if (!session || selectedIds.size === 0) return;
    checkin.mutate({
      studentId: session.student.studentId,
      itemIds: [...selectedIds],
    });
  };

  if (!session) return null;

  const safeItems = loanedItems ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b px-8 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/kiosk/home")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Check In Items</h1>
        </div>
      </div>

      <div className="flex-1 p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Your Loaned Items</p>
            <p className="text-sm text-muted-foreground">
              {safeItems.length} item{safeItems.length !== 1 ? "s" : ""} on loan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <QRScanner
              onScan={handleQRScan}
              trigger={
                <Button variant="outline" size="sm">
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan to Select
                </Button>
              }
              title="Scan Item QR Codes"
              description="Scan QR codes to select items — camera stays open for multiple scans"
              multiScan
            />
            {safeItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === safeItems.length
                      ? new Set()
                      : new Set(safeItems.map((r) => r.itemId)),
                  )
                }
              >
                {selectedIds.size === safeItems.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : safeItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <PackageCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">No items on loan</p>
              <p className="text-sm text-muted-foreground">
                You don't have any items currently loaned out.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {safeItems.map((record) => {
              const checked = selectedIds.has(record.itemId);
              return (
                <div
                  key={record.id}
                  className={`flex items-center gap-4 rounded-lg border px-4 py-4 cursor-pointer transition-colors ${
                    checked
                      ? "bg-primary/5 border-primary/30"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => toggleItem(record.itemId)}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleItem(record.itemId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="shrink-0 h-10 w-10 rounded-md overflow-hidden border bg-muted">
                    {record.item.image ? (
                      <img
                        src={`/api/items/${record.item.id}/image`}
                        alt={record.item.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{record.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.item.serial}
                    </p>
                  </div>
                  {checked && (
                    <Badge variant="secondary" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 border-t bg-background px-8 py-4">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedIds.size}
              </span>{" "}
              item{selectedIds.size !== 1 ? "s" : ""} selected
            </p>
            <Button
              className="h-11"
              disabled={checkin.isPending}
              onClick={handleConfirm}
            >
              {checkin.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Return ${selectedIds.size} Item${selectedIds.size !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
