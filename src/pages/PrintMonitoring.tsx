import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Video,
  Loader2,
  Wifi,
  Play,
  Square,
  CheckSquare,
  Info,
  Pencil,
} from "lucide-react";
import type { AMSTray } from "@/server/lib/bambuddy";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";

type PrinterStatus =
  inferRouterOutputs<AppRouter>["print"]["getLivePrinterStatuses"][number];

type CameraMode = "stream" | "snapshot";

const PAGE_SIZE = 12;

const buildCameraUrl = (
  printerId: string,
  mode: CameraMode,
  tick: number,
): string => {
  const base = `/api/webcam/${encodeURIComponent(printerId)}`;
  if (mode === "snapshot") {
    return `${base}?mode=cached_snapshot&_t=${tick}`;
  }
  return base;
};

const formatDuration = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const statusColor = (state: string) => {
  const s = state.toUpperCase();
  if (["PRINTING", "PAUSED", "BUSY"].includes(s)) return "bg-yellow-500";
  if (["ATTENTION", "UNREACHABLE"].includes(s)) return "bg-red-500";
  if (["IDLE", "READY", "FINISHED"].includes(s)) return "bg-green-500";
  return "bg-muted-foreground";
};

const statusBadgeVariant = (
  state: string,
): "default" | "secondary" | "destructive" | "outline" => {
  const s = state.toUpperCase();
  if (["PRINTING", "PAUSED", "BUSY"].includes(s)) return "secondary";
  if (["ATTENTION", "UNREACHABLE"].includes(s)) return "destructive";
  if (["IDLE", "READY", "FINISHED"].includes(s)) return "default";
  return "outline";
};

// ─── Printer overview card ────────────────────────────────────────────────────

function PrinterCard({
  status,
  onClick,
}: {
  status: PrinterStatus;
  onClick: () => void;
}) {
  return (
    <Card
      className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 bg-card border-border/50"
      onClick={onClick}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-colors duration-500 z-20 ${statusColor(status.state)}`}
      />

      <CardContent className="px-4 py-2 flex flex-col h-full gap-3 relative z-10 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col min-w-0 flex-1 space-y-1">
            <h3 className="font-bold text-base tracking-tight truncate group-hover:text-primary transition-colors">
              {status.printerName}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border/50 shrink-0">
                {status.printerType}
              </span>
              <span className="font-mono text-[10px] opacity-70 truncate">
                {status.ipAddress}
              </span>
            </div>
            <p
              className={`text-[11px] truncate ${["ATTENTION", "UNREACHABLE", "ERROR"].includes(status.state.toUpperCase()) ? "text-destructive font-medium" : "text-muted-foreground"}`}
              title={status.stateMessage}
            >
              {status.stateMessage}
            </p>
          </div>
          <Badge
            variant={statusBadgeVariant(status.state)}
            className="shrink-0 mt-0.5 pl-2 pr-2.5 py-1 shadow-sm transition-colors border-border/20"
          >
            <span
              className={`h-2 w-2 rounded-full mr-1.5 ${statusColor(status.state)} ${["PRINTING", "BUSY"].includes(status.state.toUpperCase()) ? "animate-pulse" : ""}`}
            />
            <span className="uppercase text-[10px] tracking-wider font-bold whitespace-nowrap">
              {status.state}
            </span>
          </Badge>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Progress
              </span>
              <span className="text-2xl font-black tracking-tighter tabular-nums leading-none">
                {status.progress != null
                  ? `${status.progress.toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex flex-col text-right shrink-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5">
                Remaining
              </span>
              <span className="text-base font-bold tabular-nums leading-none text-foreground/80">
                {status.timeRemaining != null
                  ? formatDuration(status.timeRemaining)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/80 shadow-inner border border-border/40">
            <div
              className={`h-full transition-all duration-1000 ease-out rounded-full ${statusColor(status.state)}`}
              style={{ width: `${status.progress ?? 0}%` }}
            />
          </div>
          {status.layerNum != null && status.totalLayers != null ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Layer {status.layerNum} / {status.totalLayers}
            </span>
          ) : null}
        </div>

        <div className="mt-auto space-y-1.5">
          {status.awaitingPlateClear ? (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5">
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Awaiting plate clear
              </span>
            </div>
          ) : null}
          {status.startedBy ? (
            <div className="bg-primary/5 rounded-md px-2.5 py-1.5 border border-primary/20">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Printed by
              </span>
              <p
                className="text-sm font-semibold truncate text-foreground"
                title={status.startedBy.name}
              >
                {status.startedBy.name}
              </p>
            </div>
          ) : null}
          <div className="bg-secondary/30 rounded-md px-2.5 py-1.5 border border-border/50 transition-colors group-hover:bg-secondary/50">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
              Current File
            </span>
            <p
              className={`text-sm font-medium truncate ${!status.fileName ? "text-muted-foreground/60 italic" : "text-foreground"}`}
              title={status.fileName ?? undefined}
            >
              {status.fileName ?? "No active print"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Bambu sends tray_color as RRGGBBAA (8 hex chars) or RRGGBB (6 hex chars)
const parseTrayColor = (hex: string | null): string => {
  if (!hex || hex.length < 6) return "transparent";
  return `#${hex.slice(0, 6)}`;
};

// #RRGGBB → RRGGBBFF (Bambu format)
const hexToTrayColor = (hex: string): string => {
  const clean = hex.replace("#", "");
  if (clean.length === 6) return `${clean.toUpperCase()}FF`;
  if (clean.length === 8) return clean.toUpperCase();
  return "000000FF";
};

const DEFAULT_TEMPS: Record<string, { min: number; max: number }> = {
  PLA: { min: 190, max: 230 },
  PETG: { min: 230, max: 250 },
  ABS: { min: 240, max: 270 },
  ASA: { min: 240, max: 260 },
  TPU: { min: 210, max: 240 },
  PA: { min: 260, max: 290 },
  PC: { min: 260, max: 280 },
  "PLA-CF": { min: 200, max: 230 },
  "PA-CF": { min: 260, max: 290 },
  "PETG-CF": { min: 240, max: 260 },
};

// ─── AMS slot edit dialog ─────────────────────────────────────────────────────

interface EditingSlot {
  bambuddyId: number;
  amsId: number;
  tray: AMSTray;
}

const spoolRemainPct = (spool: {
  label_weight: number;
  weight_used: number;
}): number =>
  spool.label_weight > 0
    ? Math.round(
        ((spool.label_weight - spool.weight_used) / spool.label_weight) * 100,
      )
    : 0;

const spoolDisplayName = (spool: {
  material: string;
  brand: string | null;
  color_name: string | null;
}): string =>
  [spool.brand, spool.material, spool.color_name].filter(Boolean).join(" · ");

function AmsSlotEditDialog({
  slot,
  onClose,
}: {
  slot: EditingSlot;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const assignmentQuery = trpc.print.getSlotAssignment.useQuery({
    bambuddyId: slot.bambuddyId,
    amsId: slot.amsId,
    trayId: slot.tray.id,
  });

  const [showSpoolPicker, setShowSpoolPicker] = useState(false);
  const spoolsQuery = trpc.print.listInventorySpools.useQuery(undefined, {
    enabled: showSpoolPicker,
  });
  const filamentTypesQuery = trpc.print.listFilamentTypes.useQuery();

  const assignment = assignmentQuery.data ?? null;
  const hasSpool = assignment?.spool != null;

  const initialRemain = hasSpool
    ? spoolRemainPct(assignment.spool!)
    : (slot.tray.remain ?? 100);

  const [trayType, setTrayType] = useState(slot.tray.tray_type ?? "PLA");
  const [subBrand, setSubBrand] = useState(slot.tray.tray_sub_brands ?? "");
  const [colorHex, setColorHex] = useState(
    parseTrayColor(slot.tray.tray_color) === "transparent"
      ? "#ffffff"
      : parseTrayColor(slot.tray.tray_color),
  );
  const [tempMin, setTempMin] = useState(
    slot.tray.nozzle_temp_min ?? DEFAULT_TEMPS.PLA.min,
  );
  const [tempMax, setTempMax] = useState(
    slot.tray.nozzle_temp_max ?? DEFAULT_TEMPS.PLA.max,
  );
  const [remain, setRemain] = useState<number>(initialRemain);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string>("");

  // Sync remain when assignment loads
  const assignmentLoaded = !assignmentQuery.isLoading;
  const [remainSynced, setRemainSynced] = useState(false);
  if (assignmentLoaded && !remainSynced) {
    setRemainSynced(true);
    if (hasSpool) {
      setRemain(spoolRemainPct(assignment.spool!));
    }
  }

  const applyTypeDefaults = (type: string) => {
    setTrayType(type);
    const defaults = DEFAULT_TEMPS[type];
    if (defaults) {
      setTempMin(defaults.min);
      setTempMax(defaults.max);
    }
  };

  const invalidateAll = async () => {
    await Promise.all([
      utils.print.getLivePrinterStatuses.invalidate(),
      utils.print.getSlotAssignment.invalidate({
        bambuddyId: slot.bambuddyId,
        amsId: slot.amsId,
        trayId: slot.tray.id,
      }),
      utils.printQueue.getPrinterAms.invalidate({
        printerId: slot.bambuddyId,
      }),
      utils.printQueue.getAvailableFilamentsForModel.invalidate(),
      utils.printQueue.getAvailableFilaments.invalidate(),
    ]);
  };

  const configureMutation = trpc.print.configureAmsSlot.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await invalidateAll();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateRemainMutation = trpc.print.updateFilamentRemain.useMutation({
    onSuccess: (result) => {
      if (result.noSpool) {
        toast.warning(result.message);
      } else {
        toast.success(result.message);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const assignMutation = trpc.print.assignSpool.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      setShowSpoolPicker(false);
      setSelectedSpoolId("");
      await assignmentQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const unassignMutation = trpc.print.unassignSpool.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await assignmentQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const createAndAssignMutation = trpc.print.createAndAssignSpool.useMutation({
    onSuccess: async (result) => {
      toast.success(
        `Spool created and assigned: ${result.label || trayType}. You can update details in inventory.`,
      );
      await assignmentQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSave = () => {
    if (!hasSpool) {
      createAndAssignMutation.mutate({
        bambuddyId: slot.bambuddyId,
        amsId: slot.amsId,
        trayId: slot.tray.id,
        material: trayType,
        brand: subBrand || null,
        colorName: null,
        rgba: hexToTrayColor(colorHex),
        nozzleTempMin: tempMin,
        nozzleTempMax: tempMax,
        remainPercent: remain,
      });
    }
    if (hasSpool && remain !== initialRemain) {
      updateRemainMutation.mutate({
        bambuddyId: slot.bambuddyId,
        amsId: slot.amsId,
        trayId: slot.tray.id,
        remainPercent: remain,
      });
    }
    configureMutation.mutate({
      bambuddyId: slot.bambuddyId,
      amsId: slot.amsId,
      trayId: slot.tray.id,
      trayInfoIdx: slot.tray.tray_info_idx ?? "",
      trayType,
      traySubBrands: subBrand,
      trayColor: hexToTrayColor(colorHex),
      nozzleTempMin: tempMin,
      nozzleTempMax: tempMax,
    });
  };

  const handleAssignSpool = () => {
    if (!selectedSpoolId) return;
    assignMutation.mutate({
      bambuddyId: slot.bambuddyId,
      spoolId: Number(selectedSpoolId),
      amsId: slot.amsId,
      trayId: slot.tray.id,
    });
  };

  const activeSpools = (spoolsQuery.data ?? []).filter(
    (s) => s.archived_at === null,
  );

  const currentColor = parseTrayColor(slot.tray.tray_color);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit AMS Slot {slot.tray.id + 1}</DialogTitle>
          <DialogDescription>
            Update filament info and inventory assignment for this slot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current slot overview */}
          <div className="flex items-center gap-3 rounded-lg border p-3 bg-card">
            <div
              className="h-8 w-8 rounded-full border border-border/60 shadow-sm shrink-0"
              style={{ background: currentColor }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Printer reports</p>
              <p className="text-sm font-medium truncate">
                {slot.tray.tray_type ?? "Empty"}{" "}
                {slot.tray.tray_sub_brands
                  ? `· ${slot.tray.tray_sub_brands}`
                  : ""}
              </p>
            </div>
          </div>

          {/* Spool assignment */}
          <div className="space-y-2">
            <Label>Inventory Spool Assignment</Label>
            {assignmentQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border p-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading assignment…
              </div>
            ) : hasSpool ? (
              <div className="rounded-lg border p-3 bg-card space-y-2">
                <div className="flex items-start gap-3">
                  <div
                    className="h-7 w-7 rounded-full border border-border/60 shadow-sm shrink-0 mt-0.5"
                    style={{
                      background: parseTrayColor(assignment.spool!.rgba),
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {spoolDisplayName(assignment.spool!)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(
                        assignment.spool!.label_weight -
                          assignment.spool!.weight_used,
                      )}
                      g remaining of {assignment.spool!.label_weight}g
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() => setShowSpoolPicker(true)}
                  >
                    Change
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs text-destructive hover:text-destructive"
                  disabled={unassignMutation.isPending}
                  onClick={() =>
                    unassignMutation.mutate({
                      bambuddyId: slot.bambuddyId,
                      amsId: slot.amsId,
                      trayId: slot.tray.id,
                    })
                  }
                >
                  {unassignMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Remove Assignment"
                  )}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  No spool assigned. Assign one to track filament usage in
                  inventory.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => setShowSpoolPicker(true)}
                >
                  Assign Spool
                </Button>
              </div>
            )}

            {showSpoolPicker ? (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium">
                  Select spool from inventory
                </p>
                {spoolsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading spools…
                  </div>
                ) : (
                  <Select
                    value={selectedSpoolId}
                    onValueChange={setSelectedSpoolId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a spool…" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSpools.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border/60 shrink-0"
                              style={{ background: parseTrayColor(s.rgba) }}
                            />
                            {spoolDisplayName(s)}{" "}
                            <span className="text-muted-foreground">
                              ({spoolRemainPct(s)}%)
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                      {activeSpools.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No spools in inventory
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    disabled={!selectedSpoolId || assignMutation.isPending}
                    onClick={handleAssignSpool}
                  >
                    {assignMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Assign"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowSpoolPicker(false);
                      setSelectedSpoolId("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Filament config */}
          <div className="space-y-1.5">
            <Label>Filament Type</Label>
            <Select value={trayType} onValueChange={applyTypeDefaults}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  filamentTypesQuery.data ?? [
                    "PLA",
                    "PETG",
                    "ABS",
                    "ASA",
                    "TPU",
                    "PA",
                    "PC",
                    "PHA",
                    "PLA-CF",
                    "PA-CF",
                    "PETG-CF",
                  ]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Brand / Sub-brand</Label>
            <Input
              value={subBrand}
              onChange={(e) => setSubBrand(e.target.value)}
              placeholder="e.g. PLA Basic, PETG HF"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              <Input
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                placeholder="#ffffff"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min Temp (°C)</Label>
              <Input
                type="number"
                value={tempMin}
                onChange={(e) => setTempMin(Number(e.target.value))}
                min={0}
                max={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Temp (°C)</Label>
              <Input
                type="number"
                value={tempMax}
                onChange={(e) => setTempMax(Number(e.target.value))}
                min={0}
                max={500}
              />
            </div>
          </div>

          {/* Remaining */}
          <div className="space-y-1.5">
            <Label>Remaining (%)</Label>
            {hasSpool ? (
              <p className="text-[11px] text-muted-foreground">
                Updates spool weight in BamBuddy inventory.
              </p>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                No spool assigned — this value won&apos;t be saved to inventory
                tracking.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={remain}
                onChange={(e) =>
                  setRemain(Math.min(100, Math.max(0, Number(e.target.value))))
                }
                min={0}
                max={100}
                className="w-24"
              />
              <div className="flex-1 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${remain}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground tabular-nums w-10 text-right">
                {remain}%
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              configureMutation.isPending ||
              updateRemainMutation.isPending ||
              createAndAssignMutation.isPending
            }
          >
            {configureMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const wifiStrengthLabel = (dbm: number): string => {
  if (dbm >= -50) return "Excellent";
  if (dbm >= -65) return "Good";
  if (dbm >= -75) return "Fair";
  return "Weak";
};

// ─── Printer detail dialog ────────────────────────────────────────────────────

function PrinterDetail({
  status,
  onClose,
}: {
  status: PrinterStatus;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const pauseMutation = trpc.print.pausePrint.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await utils.print.getLivePrinterStatuses.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resumeMutation = trpc.print.resumePrint.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await utils.print.getLivePrinterStatuses.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = trpc.print.cancelPrint.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await utils.print.getLivePrinterStatuses.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const clearPlateMutation = trpc.print.clearBuildPlate.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await utils.print.getLivePrinterStatuses.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const [cameraMode, setCameraMode] = useState<CameraMode>("snapshot");
  const [snapshotTick, setSnapshotTick] = useState(() => Date.now());
  const [bambuStreamActive, setBambuStreamActive] = useState(false);
  const bambuStreamKey = useRef(0);
  const [editingSlot, setEditingSlot] = useState<EditingSlot | null>(null);

  const slotAssignmentsQuery = trpc.print.listSlotAssignments.useQuery(
    { bambuddyId: status.bambuddyId! },
    { enabled: status.bambuddyId != null && status.amsExists },
  );
  const slotRemainMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of slotAssignmentsQuery.data ?? []) {
      if (a.spool && a.spool.label_weight > 0) {
        const pct = Math.round(
          ((a.spool.label_weight - a.spool.weight_used) /
            a.spool.label_weight) *
            100,
        );
        map.set(`${a.ams_id}:${a.tray_id}`, pct);
      }
    }
    return map;
  }, [slotAssignmentsQuery.data]);

  const stopStreamMutation = trpc.print.stopCameraStream.useMutation();

  const stopBambuStream = useCallback(() => {
    if (!bambuStreamActive) return;
    setBambuStreamActive(false);
    if (status.bambuddyId != null) {
      stopStreamMutation.mutate({ bambuddyId: status.bambuddyId });
    }
  }, [bambuStreamActive, status.bambuddyId, stopStreamMutation]);

  useEffect(() => {
    if (cameraMode !== "snapshot") return;
    const id = setInterval(() => setSnapshotTick(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [cameraMode]);

  const cameraUrl = useMemo(() => {
    if (!status.webcamUrl) return null;
    return buildCameraUrl(status.printerId, cameraMode, snapshotTick);
  }, [cameraMode, status.printerId, status.webcamUrl, snapshotTick]);

  const upperState = status.state.toUpperCase();
  const isPrinting = upperState === "PRINTING";
  const isPaused = upperState === "PAUSED";
  const canPause = isPrinting;
  const canResume = isPaused;
  const canCancel = isPrinting || isPaused;
  const anyCommandPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          stopBambuStream();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status.printerName}
            <span className="text-sm font-normal text-muted-foreground">
              {status.printerType} &bull; {status.ipAddress}
            </span>
          </DialogTitle>
        </DialogHeader>

        {["ATTENTION", "UNREACHABLE", "ERROR"].includes(
          status.state.toUpperCase(),
        ) ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {status.hmsErrors && status.hmsErrors.length > 0 ? (
              <ul className="space-y-1">
                {status.hmsErrors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-semibold shrink-0">{e.code}</span>
                    <span>{e.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-2">
                <span className="font-semibold shrink-0">Error:</span>
                <span>{status.stateMessage}</span>
              </div>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${statusColor(status.state)}`}
              />
              <span className="font-semibold">{status.stateMessage}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nozzle
            </span>
            <span className="font-semibold text-lg">
              {status.nozzleTemp != null ? status.nozzleTemp.toFixed(1) : "—"}
              °C
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bed
            </span>
            <span className="font-semibold text-lg">
              {status.bedTemp != null ? status.bedTemp.toFixed(1) : "—"}
              °C
            </span>
          </div>

          {status.chamberTemp != null ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Chamber
              </span>
              <span className="font-semibold text-lg">
                {status.chamberTemp.toFixed(1)}°C
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card col-span-2 md:col-span-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Progress
            </span>
            <div className="flex flex-col gap-2 mt-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{
                    width: `${status.progress ?? 0}%`,
                  }}
                />
              </div>
              <span className="font-semibold text-sm">
                {status.progress != null
                  ? `${status.progress.toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Time Remaining
            </span>
            <span className="font-semibold text-lg">
              {status.timeRemaining != null
                ? formatDuration(status.timeRemaining)
                : "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              File Name
            </span>
            <span
              className="font-semibold truncate"
              title={status.fileName ?? undefined}
            >
              {status.fileName ?? "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Filament
            </span>
            <span className="font-semibold">{status.filamentType ?? "—"}</span>
          </div>

          {status.layerNum != null && status.totalLayers != null ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Layers
              </span>
              <span className="font-semibold text-lg tabular-nums">
                {status.layerNum}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {status.totalLayers}
                </span>
              </span>
            </div>
          ) : null}

          {status.nozzles.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Nozzle
              </span>
              <span className="font-semibold">
                {status.nozzles
                  .map((n) => `${n.nozzle_diameter}mm ${n.nozzle_type}`)
                  .join(", ")}
              </span>
            </div>
          ) : null}

          {status.wifiSignal != null ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                WiFi
              </span>
              <div className="flex items-center gap-1.5">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{status.wifiSignal} dBm</span>
                <span className="text-xs text-muted-foreground">
                  ({wifiStrengthLabel(status.wifiSignal)})
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1 rounded-lg border p-3 bg-card">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Printed By
            </span>
            <span
              className="font-semibold truncate"
              title={status.startedBy?.name ?? undefined}
            >
              {status.startedBy?.name ?? "—"}
            </span>
          </div>
        </div>

        {status.awaitingPlateClear &&
        status.bambuddyId != null &&
        !canCancel ? (
          <div className="flex items-center gap-2 border-t pt-4 bg-amber-500/10 rounded-lg px-3 py-3 border-amber-500/30 border">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Build plate not cleared
              </p>
              <p className="text-xs text-muted-foreground">
                Remove the print from the build plate before the next job can
                start.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={clearPlateMutation.isPending}
              onClick={() =>
                clearPlateMutation.mutate({ bambuddyId: status.bambuddyId! })
              }
            >
              {clearPlateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Mark Build Plate Cleared
                </>
              )}
            </Button>
          </div>
        ) : null}

        {canCancel ? (
          <div className="flex items-center gap-2 border-t pt-4">
            {canPause ? (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyCommandPending}
                  onClick={() =>
                    pauseMutation.mutate({
                      printerIpAddress: status.ipAddress,
                    })
                  }
                >
                  {pauseMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Pausing...
                    </>
                  ) : (
                    "Pause"
                  )}
                </Button>
                {pauseMutation.isPending && (
                  <p className="text-xs text-muted-foreground">
                    This can take up to 60 seconds.
                  </p>
                )}
              </div>
            ) : null}
            {canResume ? (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyCommandPending}
                  onClick={() =>
                    resumeMutation.mutate({
                      printerIpAddress: status.ipAddress,
                    })
                  }
                >
                  {resumeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resuming...
                    </>
                  ) : (
                    "Resume"
                  )}
                </Button>
                {resumeMutation.isPending && (
                  <p className="text-xs text-muted-foreground">
                    This can take up to 60 seconds.
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Button
                variant="destructive"
                size="sm"
                disabled={anyCommandPending}
                onClick={() =>
                  cancelMutation.mutate({
                    printerIpAddress: status.ipAddress,
                  })
                }
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Print"
                )}
              </Button>
              {cancelMutation.isPending && (
                <p className="text-xs text-muted-foreground">
                  This can take up to 60 seconds.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {editingSlot ? (
          <AmsSlotEditDialog
            slot={editingSlot}
            onClose={() => {
              setEditingSlot(null);
              void slotAssignmentsQuery.refetch();
            }}
          />
        ) : null}

        {status.amsExists && status.ams.length > 0 ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">AMS</h4>
              {status.bambuddyId != null ? (
                <span className="text-[10px] text-muted-foreground">
                  Click slot to edit filament
                </span>
              ) : null}
            </div>
            {status.ams.map((unit) => (
              <div key={unit.id} className="space-y-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Unit {unit.id + 1}
                  </span>
                  {unit.humidity != null ? (
                    <span>Humidity: {unit.humidity}%</span>
                  ) : null}
                  {unit.temp != null ? (
                    <span>Temp: {unit.temp.toFixed(1)}°C</span>
                  ) : null}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {unit.tray.map((tray) => {
                    const color = parseTrayColor(tray.tray_color);
                    const inventoryRemain = slotRemainMap.get(
                      `${unit.id}:${tray.id}`,
                    );
                    const rawRemain =
                      tray.remain != null && tray.remain >= 0 ? tray.remain : 0;
                    const remainValue = inventoryRemain ?? rawRemain;
                    const isEmpty =
                      color === "transparent" || remainValue === 0;
                    const canEdit = status.bambuddyId != null;
                    return (
                      <div
                        key={tray.id}
                        className={`group relative flex flex-col items-center gap-1 rounded-lg border p-2 ${isEmpty ? "opacity-40" : ""} ${canEdit ? "cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors" : ""}`}
                        onClick={
                          canEdit
                            ? () =>
                                setEditingSlot({
                                  bambuddyId: status.bambuddyId!,
                                  amsId: unit.id,
                                  tray,
                                })
                            : undefined
                        }
                      >
                        {canEdit ? (
                          <Pencil className="absolute top-1 right-1 h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        ) : null}
                        <div
                          className="h-7 w-7 rounded-full border border-border/60 shadow-sm"
                          style={{
                            background: color,
                          }}
                        />
                        <span className="text-[10px] font-semibold text-center leading-tight truncate w-full text-center">
                          {tray.tray_type ?? "—"}
                        </span>
                        {tray.tray_sub_brands ? (
                          <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">
                            {tray.tray_sub_brands}
                          </span>
                        ) : null}
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {isEmpty ? "Empty" : `${remainValue}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status.bambuddyId != null ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-semibold">Camera</h4>
              <div className="flex items-center gap-2">
                {bambuStreamActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={stopBambuStream}
                  >
                    <Square className="mr-2 h-3.5 w-3.5" />
                    Stop Stream
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      bambuStreamKey.current += 1;
                      setBambuStreamActive(true);
                    }}
                  >
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Live Stream
                  </Button>
                )}
              </div>
            </div>
            {bambuStreamActive ? (
              <div className="overflow-hidden rounded-lg border bg-black">
                <img
                  key={bambuStreamKey.current}
                  src={`/api/bambu-stream/${status.bambuddyId}`}
                  alt={`${status.printerName} live stream`}
                  className="h-auto w-full object-contain"
                  onError={() => {
                    setBambuStreamActive(false);
                    toast.error("Stream failed. Camera may be unavailable.");
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : status.webcamUrl ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-semibold">Camera</h4>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={cameraMode}
                  onValueChange={(value) => setCameraMode(value as CameraMode)}
                >
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snapshot">Snapshot</SelectItem>
                    <SelectItem value="stream">Live Stream</SelectItem>
                  </SelectContent>
                </Select>
                {cameraMode === "snapshot" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSnapshotTick((n) => n + 1)}
                  >
                    Refresh
                  </Button>
                ) : null}
              </div>
            </div>
            {cameraUrl ? (
              <div className="overflow-hidden rounded-lg border bg-black">
                <img
                  key={cameraUrl}
                  src={cameraUrl}
                  alt={`${status.printerName} camera`}
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border-t pt-4">
            No webcam URL configured for this printer.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PrintMonitoring() {
  const dashboardQuery = trpc.print.getLivePrinterStatuses.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const printers = useMemo(
    () =>
      (dashboardQuery.data ?? []).sort(
        (a, b) =>
          a.printerType.localeCompare(b.printerType) ||
          a.printerName.localeCompare(b.printerName),
      ),
    [dashboardQuery.data],
  );

  const [page, setPage] = useState(0);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(
    null,
  );

  const totalPages = Math.max(1, Math.ceil(printers.length / PAGE_SIZE));
  const pagedPrinters = printers.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  const selectedPrinter =
    printers.find((p) => p.printerId === selectedPrinterId) ?? null;

  const hasAnyWebcam = printers.some((p) => p.webcamUrl);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Printer Monitoring</h1>
          <p className="text-muted-foreground">
            Overview of all printers. Click a printer for full telemetry and
            camera feed.
          </p>
        </div>
        {hasAnyWebcam ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = "/print-cam";
            }}
          >
            <Video className="mr-2 h-4 w-4" />
            View All Webcams
          </Button>
        ) : null}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3.5 py-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Once you remove your print from the build plate, click the printer
          card and select <strong>Mark Build Plate Cleared</strong> to
          automatically release the next job in the queue.
        </p>
      </div>

      {dashboardQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading printers...</p>
      ) : printers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No printers configured. Add printers via the Printer Management page.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedPrinters.map((printer) => (
              <PrinterCard
                key={printer.printerId}
                status={printer}
                onClick={() => setSelectedPrinterId(printer.printerId)}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      {selectedPrinter ? (
        <PrinterDetail
          status={selectedPrinter}
          onClose={() => setSelectedPrinterId(null)}
        />
      ) : null}
    </div>
  );
}
