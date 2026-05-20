import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/client/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Upload,
  Library,
  X,
  Check,
} from "lucide-react";

type TargetingMode = "any" | "model" | "printer";
type ArchiveSource = "existing" | "upload";

interface TypeSelection {
  mode: "any" | "color";
  colorHex?: string;
  colorName?: string;
}

type Step = "archive" | "targeting" | "filament" | "options" | "confirm";
const STEPS: Step[] = [
  "archive",
  "targeting",
  "filament",
  "options",
  "confirm",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQueued: () => void;
  initialArchiveSource?: ArchiveSource;
}

function ColorSwatch({
  hex,
  size = "md",
}: {
  hex: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <span
      className={`inline-block ${dim} rounded-sm border border-border/50 shrink-0`}
      style={{ backgroundColor: `#${hex.slice(0, 6)}` }}
    />
  );
}

function StepIndicator({ current, steps }: { current: Step; steps: Step[] }) {
  const idx = steps.indexOf(current);
  return (
    <div className="flex gap-1.5 mb-4">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i <= idx ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function PrintJobModal({
  open,
  onOpenChange,
  onQueued,
  initialArchiveSource,
}: Props) {
  const [step, setStep] = useState<Step>("archive");
  const [archiveSource, setArchiveSource] = useState<ArchiveSource>(
    initialArchiveSource ?? "existing",
  );
  const [archiveId, setArchiveId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [targetingMode, setTargetingMode] = useState<TargetingMode>("any");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(
    null,
  );

  // Map from slot array index → selection (one entry per filament slot)
  const [slotSelections, setSlotSelections] = useState<
    Map<number, TypeSelection>
  >(new Map());

  const [manualStart, setManualStart] = useState(false);
  const [timelapse, setTimelapse] = useState(false);
  const [bedLevelling, setBedLevelling] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const { data: projects, isLoading: projectsLoading } =
    trpc.print.getProjects.useQuery(undefined, { enabled: open });

  const { data: archives, isLoading: archivesLoading } =
    trpc.printQueue.listArchives.useQuery({ limit: 50 }, { enabled: open });

  const { data: printers, isLoading: printersLoading } =
    trpc.printQueue.listPrinters.useQuery(undefined, { enabled: open });

  const printerModels = [
    ...new Set((printers ?? []).filter((p) => p.model).map((p) => p.model!)),
  ];

  const { data: filamentReqs, isLoading: reqsLoading } =
    trpc.printQueue.getFilamentRequirements.useQuery(
      { archiveId: archiveId! },
      { enabled: archiveId != null && step === "filament" },
    );

  const { data: printerAms } = trpc.printQueue.getPrinterAms.useQuery(
    { printerId: selectedPrinterId! },
    {
      enabled:
        selectedPrinterId != null &&
        targetingMode === "printer" &&
        step === "filament",
    },
  );

  const { data: modelFilaments } =
    trpc.printQueue.getAvailableFilamentsForModel.useQuery(
      { model: selectedModel },
      {
        enabled:
          !!selectedModel && targetingMode === "model" && step === "filament",
      },
    );

  const multiPrinterFilaments = useMemo(() => {
    if (targetingMode === "model") return modelFilaments ?? [];
    return [] as NonNullable<typeof modelFilaments>;
  }, [targetingMode, modelFilaments]);

  // Per-slot type count so UI can show "(1 of 3)" labels
  const slotTypeCounts = useMemo(() => {
    if (!filamentReqs) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const req of filamentReqs) {
      if (!req.type) continue;
      counts.set(req.type, (counts.get(req.type) ?? 0) + 1);
    }
    return counts;
  }, [filamentReqs]);

  // 1-based index of each slot within its type group
  const slotTypeIndices = useMemo(() => {
    if (!filamentReqs) return new Map<number, number>();
    const seen = new Map<string, number>();
    const result = new Map<number, number>();
    filamentReqs.forEach((req, i) => {
      if (!req.type) return;
      const n = (seen.get(req.type) ?? 0) + 1;
      seen.set(req.type, n);
      result.set(i, n);
    });
    return result;
  }, [filamentReqs]);

  // For model targeting: narrow possible printers based on selected slot colors.
  const possiblePrinterIds = useMemo(() => {
    if (targetingMode !== "model" || multiPrinterFilaments.length === 0)
      return null;
    const colorSelections = [...slotSelections.entries()].filter(
      ([, sel]) => sel.mode === "color" && sel.colorHex,
    );
    if (colorSelections.length === 0) return null;

    let possible: Set<number> | null = null;
    for (const [slotIdx, sel] of colorSelections) {
      const reqType = filamentReqs?.[slotIdx]?.type;
      if (!reqType) continue;
      const selHex = sel.colorHex!.slice(0, 6).toUpperCase();
      const ids = new Set(
        multiPrinterFilaments
          .filter((f) => {
            const fHex = (f.tray_color ?? "").slice(0, 6).toUpperCase();
            return fHex === selHex && filamentTypeMatches(f.tray_type, reqType);
          })
          .map((f) => f.printer_id),
      );
      possible =
        possible === null
          ? ids
          : new Set([...possible].filter((id: number) => ids.has(id)));
    }
    return possible;
  }, [slotSelections, targetingMode, multiPrinterFilaments, filamentReqs]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setStep("archive");
      setArchiveSource(initialArchiveSource ?? "existing");
      setArchiveId(null);
      setUploadFile(null);
      setUploading(false);
      setIsDraggingFile(false);
      setTargetingMode("any");
      setSelectedModel("");
      setSelectedPrinterId(null);
      setSlotSelections(new Map());
      setManualStart(false);
      setTimelapse(false);
      setBedLevelling(true);
      setSelectedProjectId("");
    }
  }, [open]);

  // Auto-set targeting when selected archive has a known sliced_for_model
  useEffect(() => {
    if (!archiveId || !archives || !printers) return;
    const archive = archives.find((a) => a.id === archiveId);
    if (!archive?.sliced_for_model) return;
    const model = archive.sliced_for_model;
    const modelExists = printers.some(
      (p) => p.model?.toLowerCase() === model.toLowerCase(),
    );
    if (modelExists && targetingMode === "any") {
      setTargetingMode("model");
      setSelectedModel(model);
    }
  }, [archiveId, archives, printers]);

  // Initialise per-slot selections when requirements load
  useEffect(() => {
    if (filamentReqs && filamentReqs.length > 0 && slotSelections.size === 0) {
      const initial = new Map<number, TypeSelection>();
      filamentReqs.forEach((_, i) => initial.set(i, { mode: "any" }));
      setSlotSelections(initial);
    }
  }, [filamentReqs, slotSelections.size]);

  // Reset colour selections when targeting mode changes
  useEffect(() => {
    setSlotSelections((prev) => {
      if (prev.size === 0) return prev;
      const reset = new Map<number, TypeSelection>();
      for (const [idx] of prev) reset.set(idx, { mode: "any" });
      return reset;
    });
  }, [targetingMode]);

  const addMutation = trpc.printQueue.addToQueue.useMutation({
    onSuccess: (data) => {
      if (data.unmatchedSlots.length > 0) {
        toast.warning(
          `Queued with manual start — ${data.unmatchedSlots.length} slot(s) had no matching filament`,
        );
      } else {
        toast.success("Added to print queue");
      }
      onQueued();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/print-queue/upload-3mf", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { archiveId: number };
      setArchiveId(data.archiveId);
      toast.success("File uploaded — proceeding to next step");
      advance();
    } catch (err) {
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setUploading(false);
    }
  }

  const selectedProject = (projects ?? []).find(
    (p) => p.id === selectedProjectId,
  );

  function handleSubmit() {
    if (!archiveId || !filamentReqs || !selectedProjectId) return;

    // Build per-slot constraints from individual slot selections
    const constraints = filamentReqs
      .map((req, i) => {
        if (!req.type) return null;
        const sel = slotSelections.get(i);
        return {
          slotIndex: i,
          slotId: req.slot_id,
          type: req.type,
          colorHex: sel?.mode === "color" ? (sel.colorHex ?? null) : null,
          colorName: sel?.mode === "color" ? (sel.colorName ?? null) : null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    addMutation.mutate({
      archiveId,
      targeting:
        targetingMode === "printer" && selectedPrinterId
          ? { mode: "printer", printerId: selectedPrinterId }
          : targetingMode === "model" && selectedModel
            ? { mode: "model", model: selectedModel }
            : { mode: "any" },
      filamentConstraints: constraints,
      options: {
        manualStart,
        timelapse,
        bedLevelling,
        vibrationCali: true,
        flowCali: false,
      },
      notionProjectId:
        selectedProjectId !== "__personal__" ? selectedProjectId : null,
      notionProjectName: selectedProject?.name ?? null,
      personalUse: selectedProjectId === "__personal__",
    });
  }

  function canAdvance(): boolean {
    switch (step) {
      case "archive":
        if (archiveSource === "existing") return archiveId != null;
        return uploadFile != null;
      case "targeting":
        if (targetingMode === "model") return !!selectedModel;
        if (targetingMode === "printer") return selectedPrinterId != null;
        return true;
      case "options":
        return selectedProjectId !== "";
      default:
        return true;
    }
  }

  function advance() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  async function handleNext() {
    if (
      step === "archive" &&
      archiveSource === "upload" &&
      uploadFile &&
      !archiveId
    ) {
      await handleUpload();
    } else {
      advance();
    }
  }

  const selectedArchive = archives?.find((a) => a.id === archiveId);
  const selectedPrinter = printers?.find((p) => p.id === selectedPrinterId);

  const archiveLabel =
    archiveSource === "upload" && uploadFile
      ? uploadFile.name
      : (selectedArchive?.print_name ??
        selectedArchive?.filename ??
        (archiveId ? `#${archiveId}` : "—"));

  const availablePrinterSlots = printerAms?.slots ?? [];

  // Color options for a type when targeting a specific printer
  function getPrinterColorsForType(reqType: string) {
    return availablePrinterSlots.filter((s) =>
      filamentTypeMatches(s.trayType, reqType),
    );
  }

  function filamentTypeMatches(
    trayType: string | null,
    reqType: string,
  ): boolean {
    if (!trayType) return false;
    const a = trayType.toUpperCase();
    const b = reqType.toUpperCase();
    return a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
  }

  // Deduplicated color options for a type across all compatible printers
  function getMultiPrinterColorsForType(reqType: string) {
    const filtered = multiPrinterFilaments.filter((f) => {
      if (!filamentTypeMatches(f.tray_type, reqType)) return false;
      if (possiblePrinterIds !== null && !possiblePrinterIds.has(f.printer_id))
        return false;
      return true;
    });
    const seen = new Map<string, (typeof filtered)[0]>();
    for (const f of filtered) {
      const key = (f.tray_color ?? "NOCOLOR").slice(0, 6).toUpperCase();
      const existing = seen.get(key);
      if (!existing || f.remain > existing.remain) seen.set(key, f);
    }
    return [...seen.values()];
  }

  function selectColor(slotIdx: number, colorHex: string, colorName?: string) {
    setSlotSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(slotIdx);
      if (current?.mode === "color" && current.colorHex === colorHex) {
        next.set(slotIdx, { mode: "any" });
      } else {
        next.set(slotIdx, { mode: "color", colorHex, colorName });
      }
      return next;
    });
  }

  function clearColor(slotIdx: number) {
    setSlotSelections((prev) => {
      const next = new Map(prev);
      next.set(slotIdx, { mode: "any" });
      return next;
    });
  }

  const hasColorSelections = [...slotSelections.values()].some(
    (s) => s.mode === "color",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle>Queue Print Job</DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} steps={STEPS} />

        {/* ── Step: archive ── */}
        {step === "archive" && (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-md border border-border p-1 bg-muted/50">
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  archiveSource === "existing"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setArchiveSource("existing");
                  if (archiveSource !== "existing") {
                    setUploadFile(null);
                    setArchiveId(null);
                  }
                }}
              >
                <Library className="h-3.5 w-3.5" />
                Existing archive
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  archiveSource === "upload"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setArchiveSource("upload");
                  if (archiveSource !== "upload") {
                    setArchiveId(null);
                  }
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload .3mf
              </button>
            </div>

            {archiveSource === "existing" && (
              <>
                {archivesLoading && (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                )}
                {!archivesLoading && (
                  <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md p-2">
                    {(archives ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No archives found
                      </p>
                    )}
                    {(archives ?? []).map((archive) => (
                      <button
                        key={archive.id}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 min-w-0 ${
                          archiveId === archive.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        }`}
                        onClick={() => setArchiveId(archive.id)}
                      >
                        <span className="font-mono text-xs opacity-60 shrink-0">
                          #{archive.id}
                        </span>
                        <span className="break-words whitespace-normal flex-1 min-w-0">
                          {archive.print_name ?? archive.filename}
                        </span>
                        {archive.sliced_for_model && (
                          <Badge
                            variant="secondary"
                            className="text-xs shrink-0"
                          >
                            {archive.sliced_for_model}
                          </Badge>
                        )}
                        {archive.filament_type && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {archive.filament_type}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {archiveSource === "upload" && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".3mf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploadFile(f);
                    setArchiveId(null);
                  }}
                />
                {!uploadFile ? (
                  <div
                    className={`w-full border-2 border-dashed rounded-md p-8 text-center text-sm transition-colors cursor-pointer ${
                      isDraggingFile
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingFile(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingFile(false);
                      const f = e.dataTransfer.files[0] ?? null;
                      if (f) {
                        setUploadFile(f);
                        setArchiveId(null);
                      }
                    }}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {isDraggingFile
                      ? "Drop to upload"
                      : "Drag & drop or click to select a .3mf file"}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 min-w-0">
                    <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 min-w-0 text-sm">
                      {uploadFile.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setUploadFile(null);
                        setArchiveId(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  .gcode.3mf files exported from Bambu Studio or Orca Slicer
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Step: targeting ── */}
        {step === "targeting" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Printer targeting</Label>
              <Select
                value={targetingMode}
                onValueChange={(v) => setTargetingMode(v as TargetingMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">
                    Any available Bambu printer
                  </SelectItem>
                  <SelectItem value="model">Specific printer model</SelectItem>
                  <SelectItem value="printer">Specific printer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetingMode === "model" && (
              <div className="space-y-2">
                <Label>Printer model</Label>
                {printersLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model…" />
                    </SelectTrigger>
                    <SelectContent>
                      {printerModels.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {targetingMode === "printer" && (
              <div className="space-y-2">
                <Label>Printer</Label>
                {printersLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={selectedPrinterId?.toString() ?? ""}
                    onValueChange={(v) => setSelectedPrinterId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select printer…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(printers ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                          {p.model ? ` (${p.model})` : ""}
                          {p.location ? ` — ${p.location}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step: filament ── */}
        {step === "filament" && (
          <div className="space-y-3">
            {targetingMode === "any" ? (
              <p className="text-sm text-muted-foreground">
                Colour selection is not available when targeting any printer —
                Bambuddy picks the best available filament automatically.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Optionally restrict each required filament type to a specific
                colour. Leave as "Any" to let Bambuddy pick automatically.
              </p>
            )}

            {reqsLoading && <Skeleton className="h-24 w-full" />}

            {!reqsLoading && (!filamentReqs || filamentReqs.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No filament requirements found for this archive.
              </p>
            )}

            {/* Any-targeting: show types as info only, no colour picker */}
            {!reqsLoading &&
              filamentReqs &&
              filamentReqs.length > 0 &&
              targetingMode === "any" && (
                <div className="space-y-2">
                  {filamentReqs.map((req, slotIdx) => {
                    if (!req.type) return null;
                    const typeCount = slotTypeCounts.get(req.type) ?? 1;
                    const slotNum = slotTypeIndices.get(slotIdx) ?? 1;
                    return (
                      <div
                        key={slotIdx}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <Badge
                          variant="secondary"
                          className="text-xs font-mono shrink-0"
                        >
                          {req.type}
                        </Badge>
                        {typeCount > 1 && (
                          <span className="text-xs text-muted-foreground">
                            {slotNum} of {typeCount}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          Any colour
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

            {!reqsLoading &&
              filamentReqs &&
              filamentReqs.length > 0 &&
              targetingMode !== "any" &&
              (() => {
                const isMultiPrinter = targetingMode !== "printer";
                const multiLoading =
                  targetingMode === "model" && !modelFilaments;
                const printerLoading =
                  targetingMode === "printer" && !printerAms;

                return (
                  <div className="space-y-3">
                    {filamentReqs.map((req, slotIdx) => {
                      const type = req.type;
                      if (!type) return null;
                      const sel = slotSelections.get(slotIdx) ?? {
                        mode: "any" as const,
                      };
                      const isColorSelected = sel.mode === "color";
                      const typeCount = slotTypeCounts.get(type) ?? 1;
                      const slotNum = slotTypeIndices.get(slotIdx) ?? 1;

                      const printerColors = !isMultiPrinter
                        ? getPrinterColorsForType(type)
                        : [];
                      const multiColors = isMultiPrinter
                        ? getMultiPrinterColorsForType(type)
                        : [];
                      const colors = isMultiPrinter
                        ? multiColors
                        : printerColors;
                      const loading = isMultiPrinter
                        ? multiLoading
                        : printerLoading;

                      return (
                        <div
                          key={slotIdx}
                          className="rounded-md border border-border p-3 space-y-2.5"
                        >
                          {/* Slot header */}
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="text-xs font-mono"
                            >
                              {type}
                            </Badge>
                            {typeCount > 1 && (
                              <span className="text-xs text-muted-foreground">
                                {slotNum} of {typeCount}
                              </span>
                            )}
                            {isColorSelected && (
                              <button
                                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                onClick={() => clearColor(slotIdx)}
                              >
                                <X className="h-3 w-3" />
                                Clear
                              </button>
                            )}
                          </div>

                          {/* Selected color display */}
                          {isColorSelected && sel.colorHex && (
                            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-sm">
                              <ColorSwatch
                                hex={sel.colorHex.replace("#", "")}
                              />
                              <span className="font-medium">
                                {sel.colorName ?? sel.colorHex}
                              </span>
                              <Check className="h-3.5 w-3.5 text-primary ml-auto" />
                            </div>
                          )}

                          {/* Color grid */}
                          {loading ? (
                            <p className="text-xs text-muted-foreground">
                              Loading available colours…
                            </p>
                          ) : colors.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No {type} available
                              {targetingMode === "printer"
                                ? " on this printer"
                                : ""}
                              . Print will use any compatible spool.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {/* "Any" option */}
                              <button
                                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                                  !isColorSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent text-muted-foreground"
                                }`}
                                onClick={() => clearColor(slotIdx)}
                              >
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm border-2 border-dashed border-current opacity-50 shrink-0" />
                                <span>Any {type}</span>
                                {!isColorSelected && (
                                  <Check className="h-3.5 w-3.5 ml-auto" />
                                )}
                              </button>

                              {/* Color options */}
                              {(() => {
                                if (
                                  isMultiPrinter &&
                                  possiblePrinterIds?.size === 0
                                ) {
                                  return (
                                    <div className="flex gap-1.5 text-xs text-amber-600 dark:text-amber-400 pt-1">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                                      <span>
                                        No printer currently has all selected
                                        colours — job will wait until one
                                        becomes available.
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="grid grid-cols-1 gap-0.5 max-h-40 overflow-y-auto">
                                    {(isMultiPrinter
                                      ? multiColors
                                      : printerColors
                                    ).map((opt, fi) => {
                                      const hex = isMultiPrinter
                                        ? ((opt as (typeof multiColors)[0])
                                            .tray_color ?? "")
                                        : ((opt as (typeof printerColors)[0])
                                            .trayColor ?? "");
                                      const subBrands = isMultiPrinter
                                        ? (opt as (typeof multiColors)[0])
                                            .tray_sub_brands
                                        : (opt as (typeof printerColors)[0])
                                            .traySubBrands;
                                      const idName = isMultiPrinter
                                        ? (opt as (typeof multiColors)[0])
                                            .tray_id_name
                                        : (opt as (typeof printerColors)[0])
                                            .trayIdName;
                                      const name = subBrands ?? idName;
                                      const remain = isMultiPrinter
                                        ? (opt as (typeof multiColors)[0])
                                            .remain
                                        : (opt as (typeof printerColors)[0])
                                            .remain;

                                      const normalHex = hex
                                        .slice(0, 6)
                                        .toUpperCase();
                                      const selectedHex = (sel.colorHex ?? "")
                                        .slice(0, 6)
                                        .toUpperCase();
                                      const isSelected =
                                        isColorSelected &&
                                        normalHex === selectedHex;

                                      return (
                                        <button
                                          key={fi}
                                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors min-w-0 ${
                                            isSelected
                                              ? "bg-primary text-primary-foreground"
                                              : "hover:bg-accent"
                                          }`}
                                          onClick={() =>
                                            selectColor(
                                              slotIdx,
                                              hex,
                                              name ?? undefined,
                                            )
                                          }
                                        >
                                          {hex ? (
                                            <ColorSwatch hex={hex} />
                                          ) : (
                                            <span className="w-4 h-4 rounded-sm border border-dashed border-border shrink-0" />
                                          )}
                                          <span className="flex-1 text-left min-w-0 overflow-hidden">
                                            <span className="block truncate">
                                              {subBrands
                                                ? subBrands
                                                : idName
                                                  ? `${idName} - ${type}`
                                                  : type}
                                            </span>
                                            {subBrands && idName && (
                                              <span className="block truncate text-xs opacity-50 font-mono">
                                                {idName}
                                              </span>
                                            )}
                                          </span>
                                          <span className="opacity-60 shrink-0 text-xs">
                                            {remain}%
                                          </span>
                                          {isSelected && (
                                            <Check className="h-3.5 w-3.5 shrink-0" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Wait-for-colour hint for model targeting */}
                    {isMultiPrinter && hasColorSelections && (
                      <div className="flex gap-1.5 rounded-md border border-blue-400/40 bg-blue-50 dark:bg-blue-950/20 p-2.5 text-xs text-blue-700 dark:text-blue-400">
                        <span>
                          {possiblePrinterIds !== null &&
                          possiblePrinterIds.size > 0
                            ? `${possiblePrinterIds.size} printer${possiblePrinterIds.size === 1 ? "" : "s"} currently ${possiblePrinterIds.size === 1 ? "has" : "have"} all selected colours. `
                            : ""}
                          Job will wait for a printer with these exact colours
                          loaded before dispatching.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* ── Step: options ── */}
        {step === "options" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={projectsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      projectsLoading ? "Loading projects…" : "Select a project"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__personal__">
                    Personal / No project
                  </SelectItem>
                  {(projects ?? []).map((project) => (
                    <SelectItem value={project.id} key={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label>Manual start</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Queue without auto-dispatching — staff must start manually
                </p>
              </div>
              <Switch checked={manualStart} onCheckedChange={setManualStart} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label>Bed levelling</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run automatic bed levelling before print
                </p>
              </div>
              <Switch
                checked={bedLevelling}
                onCheckedChange={setBedLevelling}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label>Timelapse</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record timelapse of this print
                </p>
              </div>
              <Switch checked={timelapse} onCheckedChange={setTimelapse} />
            </div>
          </div>
        )}

        {/* ── Step: confirm ── */}
        {step === "confirm" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3 min-w-0">
                <span className="text-muted-foreground shrink-0">Archive</span>
                <span className="font-medium break-words text-right min-w-0">
                  {archiveLabel}
                </span>
              </div>
              <div className="flex justify-between gap-3 min-w-0">
                <span className="text-muted-foreground shrink-0">Target</span>
                <span className="font-medium break-words text-right min-w-0">
                  {targetingMode === "any"
                    ? "Any available Bambu printer"
                    : targetingMode === "model"
                      ? `Model: ${selectedModel}`
                      : `Printer: ${selectedPrinter?.name ?? selectedPrinterId}`}
                </span>
              </div>

              {/* Filament slot/colour summary */}
              {filamentReqs && filamentReqs.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  {filamentReqs.map((req, slotIdx) => {
                    if (!req.type) return null;
                    const sel = slotSelections.get(slotIdx);
                    const typeCount = slotTypeCounts.get(req.type) ?? 1;
                    const slotNum = slotTypeIndices.get(slotIdx) ?? 1;
                    return (
                      <div
                        key={slotIdx}
                        className="flex items-center justify-between gap-3 min-w-0"
                      >
                        <span className="text-muted-foreground shrink-0 font-mono text-xs">
                          {req.type}
                          {typeCount > 1 ? ` (${slotNum}/${typeCount})` : ""}
                        </span>
                        {sel?.mode === "color" && sel.colorHex ? (
                          <span className="flex items-center gap-1.5 font-medium text-right min-w-0">
                            <ColorSwatch
                              hex={sel.colorHex.replace("#", "")}
                              size="sm"
                            />
                            <span className="break-words min-w-0">
                              {sel.colorName ?? sel.colorHex}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Any colour
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between gap-3 min-w-0 pt-1 border-t border-border/50">
                <span className="text-muted-foreground shrink-0">Project</span>
                <span className="font-medium break-words text-right min-w-0">
                  {selectedProjectId === "__personal__"
                    ? "Personal / No project"
                    : (selectedProject?.name ?? "—")}
                </span>
              </div>
              <div className="flex justify-between gap-3 min-w-0">
                <span className="text-muted-foreground shrink-0">
                  Manual start
                </span>
                <span className="font-medium shrink-0">
                  {manualStart ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={back}
            disabled={step === STEPS[0]}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {step !== "confirm" ? (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={!canAdvance() || uploading}
            >
              {uploading ? "Uploading…" : "Next"}
              {!uploading && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={addMutation.isPending || !selectedProjectId}
            >
              {addMutation.isPending ? "Queuing…" : "Queue print"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
