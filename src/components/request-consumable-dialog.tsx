import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
import { NumberInput } from "./inputs/numeric-input";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type GetItemOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

interface RequestConsumableDialogProps {
  item: GetItemOutput;
  onClose: () => void;
}

type SupplierChoice =
  | { kind: "saved"; supplierId: string }
  | { kind: "custom" }
  | { kind: "primary" };

export function RequestConsumableDialog({
  item,
  onClose,
}: RequestConsumableDialogProps) {
  const consumableId = item.consumable?.id;
  const utils = trpc.useUtils();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [choice, setChoice] = useState<SupplierChoice>({ kind: "primary" });
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const { data: suppliers, isLoading: suppliersLoading } =
    trpc.consumableSupplier.listForConsumable.useQuery(
      { consumableId: consumableId ?? "" },
      { enabled: Boolean(consumableId) },
    );

  const primarySupplier = useMemo(
    () => suppliers?.find((s) => s.isPrimary) ?? null,
    [suppliers],
  );

  const requestMut = trpc.consumableRequest.create.useMutation({
    onSuccess: () => {
      toast.success("Request submitted");
      void utils.consumableRequest.pendingCount.invalidate();
      void utils.consumableRequest.myPendingCount.invalidate();
      void utils.consumableRequest.listMine.invalidate();
      void utils.consumableRequest.list.invalidate();
      onClose();
    },
    onError: (err) => {
      if (err.data?.httpStatus === 409 || err.message.includes("pending request")) {
        toast.warning("Already have a pending request", {
          description: "You already have a pending request for this item.",
          action: {
            label: "View requests",
            onClick: () => window.location.assign("/my-requests"),
          },
        });
      } else {
        toast.error("Request failed", { description: err.message });
      }
    },
  });

  if (!consumableId) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cannot request</DialogTitle>
          <DialogDescription>
            This item is not configured as a consumable.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    if (choice.kind === "saved") {
      requestMut.mutate({
        consumableId,
        quantity,
        supplierId: choice.supplierId,
        notes: notes || null,
      });
      return;
    }

    if (choice.kind === "custom") {
      if (!customName.trim() || !customUrl.trim()) {
        toast.error("Provide both supplier name and URL for custom supplier");
        return;
      }
      requestMut.mutate({
        consumableId,
        quantity,
        customSupplier: customName.trim(),
        customUrl: customUrl.trim(),
        notes: notes || null,
      });
      return;
    }

    // primary fallback
    requestMut.mutate({
      consumableId,
      quantity,
      notes: notes || null,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Request more {item.name}</DialogTitle>
        <DialogDescription>
          Available now: {item.consumable?.available ?? 0}. Requests are
          reviewed by an admin.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="qty">Quantity</Label>
          <NumberInput
            id="qty"
            min={1}
            max={100000}
            value={quantity}
            onValueChange={(n) => setQuantity(n ?? 1)}
            thousandSeparator=","
            className=""
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Supplier</Label>

          <SupplierOption
            selected={choice.kind === "primary"}
            onSelect={() => setChoice({ kind: "primary" })}
            title={
              primarySupplier
                ? `Primary: ${primarySupplier.name}`
                : "Use suggested supplier"
            }
            subtitle={
              primarySupplier
                ? primarySupplier.url
                : "Falls back to most recently requested supplier (if any)"
            }
            href={primarySupplier?.url}
            badge={primarySupplier ? "primary" : null}
          />

          {suppliersLoading && (
            <p className="text-xs text-muted-foreground">Loading suppliers…</p>
          )}

          {(suppliers ?? [])
            .filter((s) => !s.isPrimary)
            .map((s) => {
              const selected =
                choice.kind === "saved" && choice.supplierId === s.id;
              return (
                <SupplierOption
                  key={s.id}
                  selected={selected}
                  onSelect={() =>
                    setChoice({ kind: "saved", supplierId: s.id })
                  }
                  title={s.name}
                  subtitle={s.url}
                  href={s.url}
                  badge={null}
                />
              );
            })}

          <SupplierOption
            selected={choice.kind === "custom"}
            onSelect={() => setChoice({ kind: "custom" })}
            title="Other / custom supplier"
            subtitle="Provide a name and URL below"
            href={undefined}
            badge={null}
          />

          {choice.kind === "custom" && (
            <div className="flex flex-col gap-2 pl-3 border-l-2 border-muted">
              <div>
                <Label htmlFor="custom-name">Supplier name</Label>
                <Input
                  id="custom-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Sigma-Aldrich"
                />
              </div>
              <div>
                <Label htmlFor="custom-url">Product URL</Label>
                <Input
                  id="custom-url"
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything purchasing should know"
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={requestMut.isPending}>
            {requestMut.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

interface SupplierOptionProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  href: string | undefined;
  badge: "primary" | null;
}

function SupplierOption({
  selected,
  onSelect,
  title,
  subtitle,
  href,
  badge,
}: SupplierOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-input hover:bg-muted/40",
      )}
    >
      <div className="flex flex-col min-w-0">
        <span className="flex items-center gap-1 font-medium">
          {badge === "primary" && (
            <Star className="size-3 fill-amber-400 text-amber-400" />
          )}
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open supplier link"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </button>
  );
}
