import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/client/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/printing/PageHeader";
import { PRINTING_ROUTES } from "@/lib/printingRoutes";

type Tone = "good" | "bad" | "busy" | "neutral";

interface PrintRow {
  key: string;
  source: "queue" | "direct";
  name: string;
  printer: string | null;
  project: string | null;
  status: string;
  tone: Tone;
  at: Date;
  detail: string | null;
  /** Set for direct-send jobs, which can be reprinted from stored files. */
  jobId?: string;
}

const toneClass: Record<Tone, string> = {
  good: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  bad: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  busy: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  neutral: "bg-muted text-muted-foreground",
};

function queueStatus(captured: string | null): { label: string; tone: Tone } {
  switch (captured) {
    case null:
      return { label: "Queued / printing", tone: "busy" };
    case "completed":
      return { label: "Completed", tone: "good" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "missed":
      return { label: "Not tracked", tone: "neutral" };
    default:
      return { label: captured, tone: "neutral" };
  }
}

function directStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "DISPATCHED":
      return { label: "Sent to printer", tone: "good" };
    case "DISPATCH_FAILED":
      return { label: "Failed to send", tone: "bad" };
    default:
      return { label: "Stored", tone: "neutral" };
  }
}

const fmtDate = (d: Date) =>
  d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function ReprintDialog({
  row,
  onClose,
}: {
  row: PrintRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [printerIp, setPrinterIp] = useState("");
  const printersQuery = trpc.print.getPrinters.useQuery(undefined, {
    enabled: row != null,
  });
  const reprint = trpc.print.reprintJob.useMutation({
    onSuccess: (result) => {
      toast.success(result.dispatchResponse ?? "Reprint started.");
      void utils.print.listMyPrintJobs.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={row != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprint</DialogTitle>
          <DialogDescription>
            Send <strong>{row?.name}</strong> to a printer again.
          </DialogDescription>
        </DialogHeader>
        <Select value={printerIp} onValueChange={setPrinterIp}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a printer…" />
          </SelectTrigger>
          <SelectContent>
            {(printersQuery.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.ipAddress}>
                {p.name} ({p.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!printerIp || reprint.isPending || !row?.jobId}
            onClick={() =>
              row?.jobId &&
              reprint.mutate({
                printJobId: row.jobId,
                printerIpAddress: printerIp,
              })
            }
          >
            {reprint.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending… (up to 60s)
              </>
            ) : (
              "Reprint"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyPrints() {
  const queueQuery = trpc.printQueue.listMine.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const directQuery = trpc.print.listMyPrintJobs.useQuery();
  const [reprintRow, setReprintRow] = useState<PrintRow | null>(null);

  const rows = useMemo<PrintRow[]>(() => {
    const fromQueue: PrintRow[] = (queueQuery.data ?? []).map((s) => {
      const st = queueStatus(s.capturedStatus);
      const grams =
        s.capturedFilamentGrams != null
          ? `${Math.round(s.capturedFilamentGrams)} g${
              s.capturedFilamentType ? ` ${s.capturedFilamentType}` : ""
            }`
          : null;
      return {
        key: `q-${s.id}`,
        source: "queue",
        name: s.archiveName ?? "Queued print",
        printer: s.capturedPrinterName,
        project: s.personalUse ? "Personal" : s.notionProjectName,
        status: st.label,
        tone: st.tone,
        at: new Date(s.capturedStartedAt ?? s.createdAt),
        detail: grams,
      };
    });
    const fromDirect: PrintRow[] = (directQuery.data ?? []).map((j) => {
      const st = directStatus(j.status);
      return {
        key: `d-${j.id}`,
        source: "direct",
        name: j.originalFilename,
        printer: j.printer.name,
        project: j.personalUse ? "Personal" : j.notionProjectName,
        status: st.label,
        tone: st.tone,
        at: new Date(j.createdAt),
        detail: j.status === "DISPATCH_FAILED" ? j.dispatchError : null,
        jobId: j.s3Key ? j.id : undefined,
      };
    });
    return [...fromQueue, ...fromDirect].sort(
      (a, b) => b.at.getTime() - a.at.getTime(),
    );
  }, [queueQuery.data, directQuery.data]);

  const isLoading = queueQuery.isLoading || directQuery.isLoading;
  const isError = queueQuery.isError || directQuery.isError;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <PageHeader
        title="My prints"
        description="Everything you've queued or sent to a printer, newest first."
        actions={
          <Button size="sm" asChild>
            <Link to={`${PRINTING_ROUTES.queue}?open=upload`}>
              <Plus className="mr-1.5 h-4 w-4" />
              New print
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Could not load your prints.
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You haven&apos;t printed anything yet. Queue a 3MF or send G-code to
            get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.key}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {[row.printer, row.project, row.detail, fmtDate(row.at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Badge variant="outline" className={toneClass[row.tone]}>
                  {row.status}
                </Badge>
                {row.jobId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReprintRow(row)}
                  >
                    Reprint
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReprintDialog row={reprintRow} onClose={() => setReprintRow(null)} />
    </div>
  );
}
