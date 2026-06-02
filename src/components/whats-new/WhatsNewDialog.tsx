import { useState, useEffect } from "react";
import { trpc } from "@/client/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export const APP_VERSION = "1.2.0";

interface ChangeEntry {
  type: "new" | "improved" | "fixed";
  text: string;
}

interface VersionEntry {
  version: string;
  date: string;
  title: string;
  changes: ChangeEntry[];
}

const CHANGELOG: VersionEntry[] = [
  {
    version: "1.2.0",
    date: "June 2025",
    title: "Print Queue, Filament Config & Kiosk Updates",
    changes: [
      {
        type: "new",
        text: "Print queue dispatch — submit 3MF files directly to Bambu printers; jobs are held in a queue and dispatched one at a time per printer",
      },
      {
        type: "new",
        text: "Drag-and-drop job ordering — reorder pending print jobs in the queue by dragging them into priority order",
      },
      {
        type: "new",
        text: "User association — your name is linked to a print job once it is released from the queue so ownership is always traceable",
      },
      {
        type: "new",
        text: "Print bed cleared button — operators can mark a print bed as cleared directly from the monitoring page, unblocking the next job",
      },
      {
        type: "new",
        text: "Print history & stats — view a full log of completed jobs with per-printer statistics and project breakdowns",
      },
      {
        type: "improved",
        text: "AMS filament override — edit the expected filament type for any AMS slot directly from the print monitoring page; overrides apply immediately to matching logic",
      },
      {
        type: "improved",
        text: "Personal project support — personal-use jobs can now be submitted to the queue alongside lab project jobs",
      },
      {
        type: "improved",
        text: "Full BambuStudio error coverage — all error codes documented by BambuStudio are now mapped to human-readable messages in the monitoring UI",
      },
      {
        type: "improved",
        text: "Kiosk QR scanning — check-in and check-out QR code scanning has been overhauled for faster and more reliable reads",
      },
      {
        type: "fixed",
        text: "Print queue ordering was incorrect after job state changes — queue now re-sorts correctly",
      },
      {
        type: "fixed",
        text: "Printer selection is now required before uploading a print job — previously the upload could proceed without a target printer selected",
      },
      {
        type: "fixed",
        text: "Add-to-queue popup was overflowing on smaller screens — dialog is now centred and constrained correctly",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "May 2025",
    title: "Print Monitoring & Filament Matching",
    changes: [
      {
        type: "new",
        text: "Print monitoring page with live Bambu printer status",
      },
      {
        type: "new",
        text: "AMS filament slot tracking and automatic matching",
      },
      { type: "new", text: "Print history with project tracking" },
    ],
  },
];

const TYPE_STYLES: Record<
  ChangeEntry["type"],
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  },
  improved: {
    label: "Improved",
    className:
      "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  },
  fixed: {
    label: "Fixed",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  },
};

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = trpc.user.getSelf.useQuery();
  const acknowledge = trpc.user.acknowledgeVersion.useMutation();

  useEffect(() => {
    if (isLoading || !data) return;
    if (data.lastSeenVersion !== APP_VERSION) {
      setOpen(true);
    }
  }, [isLoading, data]);

  function handleClose() {
    setOpen(false);
    acknowledge.mutate({ version: APP_VERSION });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">What&apos;s New</DialogTitle>
            <Badge variant="outline" className="text-xs font-mono">
              v{APP_VERSION}
            </Badge>
          </div>
          <DialogDescription>
            Here&apos;s what changed since you last logged in.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-96 pr-2">
          <div className="space-y-6 py-2">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{entry.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.date}
                  </span>
                </div>
                <ul className="space-y-2">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant="outline"
                        className={`mt-0.5 shrink-0 text-xs ${TYPE_STYLES[change.type].className}`}
                      >
                        {TYPE_STYLES[change.type].label}
                      </Badge>
                      <span className="text-foreground/80">{change.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2">
          <Button onClick={handleClose}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
