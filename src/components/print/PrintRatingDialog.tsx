import { useEffect, useRef, useState } from "react";
import { trpc } from "@/client/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Smile, Meh, Frown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Smiley = "GOOD" | "OKAY" | "BAD";

type RatingTag =
  | "GOOD"
  | "FAILED"
  | "STOPPED"
  | "MECHANICAL_ISSUE"
  | "FILAMENT_ISSUE"
  | "WARPING"
  | "STRINGING"
  | "LAYER_SHIFT"
  | "OTHER";

const TAG_OPTIONS: { value: RatingTag; label: string }[] = [
  { value: "GOOD", label: "Good" },
  { value: "FAILED", label: "Failed" },
  { value: "STOPPED", label: "Stopped" },
  { value: "MECHANICAL_ISSUE", label: "Mechanical issue" },
  { value: "FILAMENT_ISSUE", label: "Filament issue" },
  { value: "WARPING", label: "Warping" },
  { value: "STRINGING", label: "Stringing" },
  { value: "LAYER_SHIFT", label: "Layer shift" },
  { value: "OTHER", label: "Other" },
];

const SMILEYS: { value: Smiley; icon: typeof Smile; label: string }[] = [
  { value: "GOOD", icon: Smile, label: "Good print" },
  { value: "OKAY", icon: Meh, label: "Okay print" },
  { value: "BAD", icon: Frown, label: "Bad print" },
];

interface PrintRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bambuddyId: number;
  printerName?: string;
  fileName?: string;
  mode: "user" | "kiosk";
  onCleared?: () => void;
}

export function PrintRatingDialog({
  open,
  onOpenChange,
  bambuddyId,
  printerName,
  fileName,
  mode,
  onCleared,
}: PrintRatingDialogProps) {
  const [smiley, setSmiley] = useState<Smiley | null>(null);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [notes, setNotes] = useState("");
  const clearTriggered = useRef(false);

  const userClearMutation = trpc.print.clearBuildPlate.useMutation({
    onSuccess: () => onCleared?.(),
    onError: () => toast.error("Failed to clear build plate"),
  });
  const kioskClearMutation = trpc.print.clearKioskBuildPlate.useMutation({
    onSuccess: () => onCleared?.(),
    onError: () => toast.error("Failed to clear build plate"),
  });
  const clearMutation =
    mode === "kiosk" ? kioskClearMutation : userClearMutation;

  const userRatingMutation = trpc.print.submitPrintRating.useMutation();
  const kioskRatingMutation = trpc.print.submitKioskPrintRating.useMutation();
  const ratingMutation =
    mode === "kiosk" ? kioskRatingMutation : userRatingMutation;

  useEffect(() => {
    if (open && !clearTriggered.current) {
      clearTriggered.current = true;
      clearMutation.mutate({ bambuddyId });
    }
    if (!open) {
      clearTriggered.current = false;
      setSmiley(null);
      setTags([]);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bambuddyId]);

  const toggleTag = (tag: RatingTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = () => {
    if (!smiley) return;
    ratingMutation.mutate(
      {
        bambuddyId,
        printerName,
        fileName,
        smiley,
        tags,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Thanks for rating this print!");
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to submit rating"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate this print</DialogTitle>
          <DialogDescription>
            {printerName ?? "Printer"}
            {fileName ? ` — ${fileName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/40">
          {clearMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">
                Clearing build plate...
              </span>
            </>
          ) : clearMutation.isError ? (
            <span className="text-destructive">
              Could not clear build plate.
            </span>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">Build plate cleared</span>
            </>
          )}
        </div>

        <div className="space-y-4 py-2">
          <div className="flex justify-center gap-6">
            {SMILEYS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                onClick={() => setSmiley(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-3 transition-colors",
                  smiley === value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-8 w-8" />
              </button>
            ))}
          </div>

          {smiley ? (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                What happened? (optional)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {TAG_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={tags.includes(value)}
                      onCheckedChange={() => toggleTag(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Textarea
                placeholder="Additional notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!smiley || ratingMutation.isPending}
          >
            {ratingMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Submit rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
