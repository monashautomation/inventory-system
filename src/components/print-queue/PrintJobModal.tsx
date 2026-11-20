import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/client/trpc";
import {
  filamentTypeMatches,
  dedupeFilamentColors,
} from "@/lib/filamentColors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  blockedPrinterReasons,
  evaluateTargeting,
  type GatePrinter,
  type GateTargeting,
} from "@/lib/queueGate";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Upload,
  Library,
  X,
  Check,
  Pencil,
  Tag,
  Search,
} from "lucide-react";

type TargetingMode = "any" | "model" | "printer";
type ArchiveSource = "existing" | "upload";

function acceptUploadFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".gcode")) {
    toast.error(
      "Plain .gcode files aren't accepted - export as .gcode.3mf from Bambu Studio or Orca Slicer",
    );
    return false;
  }
  if (!lower.endsWith(".gcode.3mf")) {
    toast.error("Only .gcode.3mf files are accepted");
    return false;
  }
  return true;
}

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
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100
  const [uploadPhase, setUploadPhase] = useState<"sending" | "processing">(
    "sending",
  );
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [targetingMode, setTargetingMode] = useState<TargetingMode>("model");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(
    null,
  );

  // Map from slot array index → selection (one entry per filament slot)
  const [slotSelections, setSlotSelections] = useState<
    Map<number, TypeSelection>
  >(new Map());

  const [timelapse, setTimelapse] = useState(false);
  const [bedLevelling, setBedLevelling] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectComboOpen, setProjectComboOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projects, isLoading: projectsLoading } =
    trpc.print.getProjects.useQuery(undefined, { enabled: open });

  const { data: archives, isLoading: archivesLoading } =
    trpc.printQueue.listArchives.useQuery({ limit: 50 }, { enabled: open });

  const { data: printers, isLoading: printersLoading } =
    trpc.printQueue.listPrinters.useQuery(undefined, { enabled: open });

  const printerModels = [
    ...new Set((printers ?? []).filter((p) => p.model).map((p) => p.model!)),
  ];

  // Printers with a blocking error can't take a new print until it is cleared.
  // (Flag-only errors, such as a bad file, do not block; see
  // docs/hms-error-policy.md.)
  const { data: connectivity } =
    trpc.printQueue.listPrinterConnectivity.useQuery(undefined, {
      enabled: open,
      refetchInterval: 15_000,
    });
  const gatePrinters: GatePrinter[] = (printers ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    blockingErrors:
      connectivity?.find((c) => c.id === p.id)?.blockingErrors ?? [],
  }));
  const blockedReasons = blockedPrinterReasons(gatePrinters);
  const modelBlocked = (model: string) =>
    !evaluateTargeting({ mode: "model", model }, gatePrinters).allowed;
  const gateTargeting: GateTargeting | null =
    targetingMode === "printer" && selectedPrinterId != null
      ? { mode: "printer", printerId: selectedPrinterId }
      : targetingMode === "model" && selectedModel
        ? { mode: "model", model: selectedModel }
        : null;
  const gate = gateTargeting
    ? evaluateTargeting(gateTargeting, gatePrinters)
    : { allowed: true as const };

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

  // Matches the `isMultiPrinter` flag computed in the filament-step render
  const isMultiPrinterFilamentStep = targetingMode !== "printer";

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
      setTargetingMode("model");
      setSelectedModel("");
      setSelectedPrinterId(null);
      setSlotSelections(new Map());
      setTimelapse(false);
      setBedLevelling(true);
      setSelectedProjectId("");
      setFindFilamentOpen(false);
      setFindPrinterId(null);
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
    if (modelExists && !selectedModel) {
      setTargetingMode("model");
      setSelectedModel(model);
    }
  }, [archiveId, archives, printers]);

  // Auto-open the project picker once a print is uploaded or picked, unless
  // a project has already been chosen
  useEffect(() => {
    if ((uploadFile || archiveId) && !selectedProjectId) {
      setProjectComboOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadFile, archiveId]);

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
          `Queued - ${data.unmatchedSlots.length} slot(s) had no matching filament yet; Bambuddy will assign automatically`,
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
    setUploadProgress(0);
    setUploadPhase("sending");
    try {
      // Leg 1: browser → server via XHR for real upload progress (maps to 0–50%)
      const jobId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/print-queue/upload-3mf");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 50));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as { jobId: string };
            resolve(data.jobId);
          } else {
            reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        const form = new FormData();
        form.append("file", uploadFile);
        form.append(
          "projectName",
          selectedProjectId === "__personal__"
            ? ""
            : (selectedProject?.name ?? ""),
        );
        form.append(
          "personalUse",
          String(selectedProjectId === "__personal__"),
        );
        xhr.send(form);
      });

      // Leg 2: server → BamBuddy; poll for progress (maps to 50–100%)
      setUploadPhase("processing");
      const POLL_INTERVAL = 1000;
      const POLL_TIMEOUT = 5 * 60 * 1000;
      const deadline = Date.now() + POLL_TIMEOUT;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const poll = await fetch(
          `/api/print-queue/upload-status/${encodeURIComponent(jobId)}`,
        );
        if (!poll.ok) {
          const text = await poll.text().catch(() => "");
          throw new Error(text || `Poll HTTP ${poll.status}`);
        }
        const job = (await poll.json()) as
          | { status: "pending"; progress: number }
          | { status: "completed"; archiveId: number }
          | { status: "failed"; error: string };

        if (job.status === "completed") {
          setUploadProgress(100);
          setArchiveId(job.archiveId);
          toast.success("File uploaded - proceeding to next step");
          advance();
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error);
        }
        // pending: map server-side byte progress to 50–99%
        setUploadProgress(50 + Math.round(job.progress * 49));
      }
      throw new Error("Upload timed out waiting for BamBuddy");
    } catch (err) {
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
        if (selectedProjectId === "") return false;
        if (archiveSource === "existing") return archiveId != null;
        return uploadFile != null;
      case "targeting":
        if (!gate.allowed) return false;
        if (targetingMode === "model") return !!selectedModel;
        if (targetingMode === "printer") return selectedPrinterId != null;
        return true;
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
        (archiveId ? `#${archiveId}` : "-"));

  const availablePrinterSlots = printerAms?.slots ?? [];

  // Color options for a type when targeting a specific printer. Named
  // colours are deduplicated by hex (an AMS can have the same colour loaded
  // in multiple slots); unrecognised trays are never deduplicated - every
  // one is a distinct physical tray needing its own name.
  function getPrinterColorsForType(reqType: string) {
    const filtered = availablePrinterSlots.filter((s) =>
      filamentTypeMatches(s.trayType, reqType),
    );
    const seen = new Set<string>();
    const known: typeof filtered = [];
    const unknown: typeof filtered = [];
    for (const s of filtered) {
      if (s.colorName) {
        const key = (s.trayColor ?? "NOCOLOR").slice(0, 6).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          known.push(s);
        }
      } else {
        unknown.push(s);
      }
    }
    return { known, unknown };
  }

  // Color options for a type across all compatible printers. Named colours
  // are deduplicated by hex (keeping the fullest spool); unrecognised trays
  // are never deduplicated - every one is a distinct physical tray.
  function getMultiPrinterColorsForType(reqType: string) {
    const filtered = multiPrinterFilaments.filter((f) => {
      if (!filamentTypeMatches(f.tray_type, reqType)) return false;
      if (possiblePrinterIds !== null && !possiblePrinterIds.has(f.printer_id))
        return false;
      return true;
    });
    return dedupeFilamentColors(
      filtered,
      (f) => f.tray_color,
      (f) => f.spool_color_name,
      (f) => f.remain,
    );
  }

  const overrideFilamentToFullMutation =
    trpc.printQueue.overrideFilamentToFull.useMutation();

  function selectColor(
    slotIdx: number,
    colorHex: string,
    filamentType: string,
    colorName?: string,
  ) {
    setSlotSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(slotIdx);
      if (current?.mode === "color" && current.colorHex === colorHex) {
        next.set(slotIdx, { mode: "any" });
      } else {
        next.set(slotIdx, { mode: "color", colorHex, colorName });
        // Filament remaining is not tracked for print blocking - reset every
        // matching spool (any printer) to 100% as soon as it's chosen.
        overrideFilamentToFullMutation.mutate({ filamentType, colorHex });
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

  // ── Colour naming popup ──────────────────────────────────────────────
  interface NamingLocation {
    printerId: number;
    printerName: string;
    amsId: number;
    trayId: number;
  }

  const [namingTarget, setNamingTarget] = useState<{
    filamentType: string;
    hex: string;
    locations: NamingLocation[];
    // True only for the "Can't find your filament?" flow, where the slot's
    // type isn't already known from a filament requirement - the user must
    // supply it themselves rather than it being locked from context.
    editableType: boolean;
  } | null>(null);
  const [namingLocationIdx, setNamingLocationIdx] = useState(0);
  const [namingTypeInput, setNamingTypeInput] = useState("");
  const [namingNameInput, setNamingNameInput] = useState("");
  const [namingHexInput, setNamingHexInput] = useState("");
  const [locationSelectOpen, setLocationSelectOpen] = useState(false);

  // "Can't find your filament?" - manual printer/slot lookup independent of
  // the current filament requirements, for registering or correcting a slot
  // that isn't showing up (or showing wrong) in the picker above.
  const [findFilamentOpen, setFindFilamentOpen] = useState(false);
  const [findPrinterId, setFindPrinterId] = useState<number | null>(null);
  const findPrinterAmsQuery = trpc.printQueue.getPrinterAms.useQuery(
    { printerId: findPrinterId! },
    { enabled: findFilamentOpen && findPrinterId != null },
  );

  function formatSlotLabel(loc: NamingLocation): string {
    return loc.amsId === 255
      ? `External Spool ${loc.trayId + 1}`
      : `AMS${loc.amsId}`;
  }

  const utils = trpc.useUtils();
  const nameFilamentColorMutation =
    trpc.printQueue.nameFilamentColor.useMutation({
      onSuccess: () => {
        toast.success("Colour saved");
        void utils.printQueue.getPrinterAms.invalidate();
        void utils.printQueue.getAvailableFilamentsForModel.invalidate();
        setNamingTarget(null);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to save colour");
      },
    });

  function openNamingPopup(
    filamentType: string,
    hex: string,
    currentName: string | null,
  ) {
    const normalizedHex = hex.slice(0, 6).toUpperCase();
    const locations: NamingLocation[] = [];

    if (isMultiPrinterFilamentStep) {
      for (const f of multiPrinterFilaments) {
        if (!filamentTypeMatches(f.tray_type, filamentType)) continue;
        if ((f.tray_color ?? "").slice(0, 6).toUpperCase() !== normalizedHex)
          continue;
        locations.push({
          printerId: f.printer_id,
          printerName: f.printer_name,
          amsId: f.ams_id,
          trayId: f.tray_id,
        });
      }
    } else if (selectedPrinterId != null) {
      for (const s of availablePrinterSlots) {
        if (!filamentTypeMatches(s.trayType, filamentType)) continue;
        if ((s.trayColor ?? "").slice(0, 6).toUpperCase() !== normalizedHex)
          continue;
        locations.push({
          printerId: selectedPrinterId,
          printerName: selectedPrinter?.name ?? `#${selectedPrinterId}`,
          amsId: s.amsId,
          trayId: s.trayId,
        });
      }
    }

    setNamingTarget({
      filamentType,
      hex: normalizedHex,
      locations,
      editableType: false,
    });
    setNamingLocationIdx(0);
    setNamingTypeInput(filamentType);
    setNamingNameInput(currentName ?? "");
    setNamingHexInput(normalizedHex);
    setLocationSelectOpen(false);
  }

  // Multiple unrecognised trays get grouped into one "N Unknown Filaments"
  // row (their hexes are meaningless firmware placeholders, so they can't be
  // grouped by colour). Opening it must force the user to pick a printer/AMS
  // slot before naming - no default location, no prefilled name/hex.
  function openUnknownNamingPopup(
    filamentType: string,
    locations: NamingLocation[],
  ) {
    setNamingTarget({
      filamentType,
      hex: "",
      locations,
      editableType: false,
    });
    setNamingLocationIdx(-1);
    setNamingTypeInput(filamentType);
    setNamingNameInput("");
    setNamingHexInput("");
    setLocationSelectOpen(locations.length > 1);
  }

  // Manual lookup flow: the user picked a specific printer/slot themselves
  // (not derived from a filament requirement), so the type isn't known in
  // advance - pre-fill from whatever's currently registered there, if
  // anything, and let them edit or set it from scratch.
  function openFindFilamentPopup(
    location: NamingLocation,
    current: { type: string; hex: string; colorName: string | null } | null,
  ) {
    const normalizedHex = (current?.hex ?? "").slice(0, 6).toUpperCase();
    setNamingTarget({
      filamentType: current?.type ?? "",
      hex: normalizedHex,
      locations: [location],
      editableType: true,
    });
    setNamingLocationIdx(0);
    setNamingTypeInput(current?.type ?? "");
    setNamingNameInput(current?.colorName ?? "");
    setNamingHexInput(normalizedHex);
    setLocationSelectOpen(false);
  }

  // "PRNT001-AMS0,AMS3, PRNT010-AMS2" - one segment per printer, AMS ids
  // grouped and sorted within it.
  function formatUnknownLocations(locations: NamingLocation[]): string {
    const byPrinter = new Map<number, { name: string; amsIds: number[] }>();
    for (const loc of locations) {
      const entry = byPrinter.get(loc.printerId) ?? {
        name: loc.printerName,
        amsIds: [],
      };
      if (!entry.amsIds.includes(loc.amsId)) entry.amsIds.push(loc.amsId);
      byPrinter.set(loc.printerId, entry);
    }
    return [...byPrinter.values()]
      .map(
        (e) =>
          `${e.name}-AMS${[...e.amsIds].sort((a, b) => a - b).join(",AMS")}`,
      )
      .join(", ");
  }

  function submitNamingPopup() {
    if (!namingTarget) return;
    const location = namingTarget.locations[namingLocationIdx];
    if (!location) return;
    const type = namingTarget.editableType
      ? namingTypeInput.trim()
      : namingTarget.filamentType;
    if (!type || !namingNameInput.trim() || !namingHexInput.trim()) return;

    nameFilamentColorMutation.mutate({
      printerId: location.printerId,
      amsId: location.amsId,
      trayId: location.trayId,
      filamentType: type,
      colorHex: namingHexInput.trim(),
      colorName: namingNameInput.trim(),
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg w-full flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Queue Print Job</DialogTitle>
          </DialogHeader>

          <StepIndicator current={step} steps={STEPS} />

          <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
            {/* ── Step: archive ── */}
            {step === "archive" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Popover
                    open={projectComboOpen}
                    onOpenChange={(o) => {
                      setProjectComboOpen(o);
                      if (!o) setProjectSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={projectComboOpen}
                        disabled={projectsLoading}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {projectsLoading
                            ? "Loading projects…"
                            : selectedProjectId === "__personal__"
                              ? "Personal / No project"
                              : selectedProjectId
                                ? ((projects ?? []).find(
                                    (p) => p.id === selectedProjectId,
                                  )?.name ?? "Select a project")
                                : "Select a project"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search projects…"
                          value={projectSearch}
                          onValueChange={setProjectSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No project found.</CommandEmpty>
                          <CommandGroup>
                            {(() => {
                              const q = projectSearch.toLowerCase();
                              const showPersonal =
                                !q || "personal / no project".includes(q);
                              const filtered = (projects ?? []).filter(
                                (p) =>
                                  p.name.trim() !== "" &&
                                  (!q || p.name.toLowerCase().includes(q)),
                              );
                              return (
                                <>
                                  {showPersonal && (
                                    <CommandItem
                                      value="__personal__"
                                      onSelect={() => {
                                        setSelectedProjectId("__personal__");
                                        setProjectComboOpen(false);
                                        setProjectSearch("");
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${selectedProjectId === "__personal__" ? "opacity-100" : "opacity-0"}`}
                                      />
                                      Personal / No project
                                    </CommandItem>
                                  )}
                                  {filtered.map((project) => (
                                    <CommandItem
                                      key={project.id}
                                      value={project.id}
                                      onSelect={() => {
                                        setSelectedProjectId(project.id);
                                        setProjectComboOpen(false);
                                        setProjectSearch("");
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${selectedProjectId === project.id ? "opacity-100" : "opacity-0"}`}
                                      />
                                      {project.name}
                                    </CommandItem>
                                  ))}
                                </>
                              );
                            })()}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

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
                    Upload .gcode.3mf
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
                              {archive.filename}
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
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0"
                              >
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
                      accept=".gcode.3mf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && !acceptUploadFile(f)) {
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                          return;
                        }
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
                          if (f && acceptUploadFile(f)) {
                            setUploadFile(f);
                            setArchiveId(null);
                          }
                        }}
                      >
                        <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        {isDraggingFile
                          ? "Drop to upload"
                          : "Drag & drop or click to select a .gcode.3mf file"}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 min-w-0">
                          <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate flex-1 min-w-0 text-sm">
                            {uploadFile.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          {!uploading && (
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
                          )}
                        </div>
                        {uploading && (
                          <div className="space-y-1">
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {uploadPhase === "sending"
                                ? `Sending… ${uploadProgress}%`
                                : `Processing on printer server… ${uploadProgress}%`}
                            </p>
                          </div>
                        )}
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
                  <Label>Targeting Mode</Label>
                  <Select
                    value={targetingMode}
                    onValueChange={(v) => setTargetingMode(v as TargetingMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="model">Printer Model</SelectItem>
                      <SelectItem value="printer">Specific Printer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetingMode === "model" && (
                  <div className="space-y-2">
                    <Label>Model</Label>
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
                            <SelectItem
                              key={m}
                              value={m}
                              disabled={modelBlocked(m)}
                            >
                              {m}
                              {modelBlocked(m) ? " - all have errors" : ""}
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
                            <SelectItem
                              key={p.id}
                              value={String(p.id)}
                              disabled={blockedReasons.has(p.id)}
                            >
                              {p.name}
                              {p.model ? ` (${p.model})` : ""}
                              {p.location ? ` - ${p.location}` : ""}
                              {blockedReasons.has(p.id)
                                ? " - has an error"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {!gate.allowed ? (
                  <Alert variant="destructive">
                    <AlertDescription>{gate.reason}</AlertDescription>
                  </Alert>
                ) : blockedReasons.size > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Printers with an error are greyed out until it is cleared on
                    Monitor.
                  </p>
                ) : null}
              </div>
            )}

            {/* ── Step: filament ── */}
            {step === "filament" && (
              <div className="space-y-3">
                {targetingMode === "any" ? (
                  <p className="text-sm text-muted-foreground">
                    Colour selection is not available when targeting any printer
                    - Bambuddy picks the best available filament automatically.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Optionally restrict each required filament type to a
                    specific colour. Leave as "Any" to let Bambuddy pick
                    automatically.
                  </p>
                )}

                {reqsLoading && <Skeleton className="h-24 w-full" />}

                {!reqsLoading &&
                  (!filamentReqs || filamentReqs.length === 0) && (
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
                            : { known: [], unknown: [] };
                          const multiColors = isMultiPrinter
                            ? getMultiPrinterColorsForType(type)
                            : { known: [], unknown: [] };
                          const colors = isMultiPrinter
                            ? multiColors
                            : printerColors;
                          const loading = isMultiPrinter
                            ? multiLoading
                            : printerLoading;

                          const unknownLocations: NamingLocation[] =
                            colors.unknown.map((opt) =>
                              isMultiPrinter
                                ? {
                                    printerId: (
                                      opt as (typeof multiColors)["unknown"][0]
                                    ).printer_id,
                                    printerName: (
                                      opt as (typeof multiColors)["unknown"][0]
                                    ).printer_name,
                                    amsId: (
                                      opt as (typeof multiColors)["unknown"][0]
                                    ).ams_id,
                                    trayId: (
                                      opt as (typeof multiColors)["unknown"][0]
                                    ).tray_id,
                                  }
                                : {
                                    printerId: selectedPrinterId!,
                                    printerName:
                                      selectedPrinter?.name ??
                                      `#${selectedPrinterId}`,
                                    amsId: (
                                      opt as (typeof printerColors)["unknown"][0]
                                    ).amsId,
                                    trayId: (
                                      opt as (typeof printerColors)["unknown"][0]
                                    ).trayId,
                                  },
                            );

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
                              ) : colors.known.length === 0 &&
                                colors.unknown.length === 0 ? (
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
                                            No printer currently has all
                                            selected colours - job will wait
                                            until one becomes available.
                                          </span>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="grid grid-cols-1 gap-0.5 max-h-40 overflow-y-auto">
                                        {(isMultiPrinter
                                          ? multiColors.known
                                          : printerColors.known
                                        ).map((opt, fi) => {
                                          const hex = isMultiPrinter
                                            ? ((
                                                opt as (typeof multiColors)["known"][0]
                                              ).tray_color ?? "")
                                            : ((
                                                opt as (typeof printerColors)["known"][0]
                                              ).trayColor ?? "");
                                          // tray_sub_brands/tray_id_name from
                                          // the AMS often just repeat the
                                          // material (e.g. "PLA Matte") for
                                          // manually-loaded spools rather
                                          // than a real colour name - the
                                          // assigned spool's colour_name is
                                          // the only trustworthy source.
                                          const name = isMultiPrinter
                                            ? (
                                                opt as (typeof multiColors)["known"][0]
                                              ).spool_color_name
                                            : (
                                                opt as (typeof printerColors)["known"][0]
                                              ).colorName;
                                          const normalHex = hex
                                            .slice(0, 6)
                                            .toUpperCase();
                                          const selectedHex = (
                                            sel.colorHex ?? ""
                                          )
                                            .slice(0, 6)
                                            .toUpperCase();
                                          const isSelected =
                                            isColorSelected &&
                                            normalHex === selectedHex;

                                          return (
                                            <div
                                              key={fi}
                                              role="button"
                                              tabIndex={0}
                                              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors min-w-0 cursor-pointer ${
                                                isSelected
                                                  ? "bg-primary text-primary-foreground"
                                                  : "hover:bg-accent"
                                              }`}
                                              onClick={() =>
                                                selectColor(
                                                  slotIdx,
                                                  hex,
                                                  type,
                                                  name ?? undefined,
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (
                                                  e.key !== "Enter" &&
                                                  e.key !== " "
                                                )
                                                  return;
                                                selectColor(
                                                  slotIdx,
                                                  hex,
                                                  type,
                                                  name ?? undefined,
                                                );
                                              }}
                                            >
                                              {hex ? (
                                                <ColorSwatch hex={hex} />
                                              ) : (
                                                <span className="w-4 h-4 rounded-sm border border-dashed border-border shrink-0" />
                                              )}
                                              <span className="flex-1 text-left min-w-0 overflow-hidden">
                                                <span className="block truncate">
                                                  {name} - {type}
                                                </span>
                                              </span>
                                              {isSelected && (
                                                <Check className="h-3.5 w-3.5 shrink-0" />
                                              )}
                                              <button
                                                type="button"
                                                title="Edit colour"
                                                className={`shrink-0 p-1 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 ${
                                                  isSelected
                                                    ? ""
                                                    : "text-muted-foreground"
                                                }`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openNamingPopup(
                                                    type,
                                                    hex,
                                                    name,
                                                  );
                                                }}
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          );
                                        })}

                                        {/* Grouped row for every unrecognised
                                            tray of this type - hexes are
                                            meaningless firmware placeholders
                                            so they can't be grouped by
                                            colour */}
                                        {colors.unknown.length > 0 && (
                                          <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm min-w-0">
                                            <span className="w-4 h-4 rounded-sm border border-dashed border-border shrink-0" />
                                            <span className="flex-1 text-left min-w-0 overflow-hidden">
                                              <span className="block truncate">
                                                {colors.unknown.length} Unknown
                                                Filament
                                                {colors.unknown.length === 1
                                                  ? ""
                                                  : "s"}
                                              </span>
                                              <span className="block truncate text-xs opacity-50">
                                                {formatUnknownLocations(
                                                  unknownLocations,
                                                )}
                                              </span>
                                            </span>
                                            <button
                                              type="button"
                                              title="Name these colours"
                                              className="shrink-0 flex items-center gap-1 rounded-sm bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
                                              onClick={() =>
                                                openUnknownNamingPopup(
                                                  type,
                                                  unknownLocations,
                                                )
                                              }
                                            >
                                              <Tag className="h-3.5 w-3.5" />
                                              Choose Colour
                                            </button>
                                          </div>
                                        )}
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
                              Job will wait for a printer with these exact
                              colours loaded before dispatching.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {!reqsLoading && filamentReqs && filamentReqs.length > 0 && (
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    onClick={() => setFindFilamentOpen(true)}
                  >
                    <Search className="h-3.5 w-3.5" />
                    Can't find your filament?
                  </button>
                )}
              </div>
            )}

            {/* ── Step: options ── */}
            {step === "options" && (
              <div className="space-y-4">
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
                    <span className="text-muted-foreground shrink-0">
                      Archive
                    </span>
                    <span className="font-medium break-words text-right min-w-0">
                      {archiveLabel}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      Target
                    </span>
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
                              {typeCount > 1
                                ? ` (${slotNum}/${typeCount})`
                                : ""}
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
                    <span className="text-muted-foreground shrink-0">
                      Project
                    </span>
                    <span className="font-medium break-words text-right min-w-0">
                      {selectedProjectId === "__personal__"
                        ? "Personal / No project"
                        : (selectedProject?.name ?? "-")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* end scroll wrapper */}

          {/* ── Navigation ── */}
          <div className="flex justify-between pt-2 shrink-0">
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
                {uploading ? `${uploadProgress}%` : "Next"}
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

      <Dialog
        open={namingTarget != null}
        onOpenChange={(o) => {
          if (!o) setNamingTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {namingTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {namingLocationIdx >= 0
                    ? `Configuring ${namingTarget.locations[namingLocationIdx]?.printerName ?? "printer"} ${formatSlotLabel(namingTarget.locations[namingLocationIdx])}`
                    : "Select a printer / slot"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {namingTarget.locations.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Printer / slot</Label>
                    <Select
                      value={
                        namingLocationIdx >= 0
                          ? String(namingLocationIdx)
                          : undefined
                      }
                      onValueChange={(v) => setNamingLocationIdx(Number(v))}
                      open={locationSelectOpen}
                      onOpenChange={setLocationSelectOpen}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select printer / slot…" />
                      </SelectTrigger>
                      <SelectContent>
                        {namingTarget.locations.map((loc, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {loc.printerName} {formatSlotLabel(loc)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {namingTarget.editableType && (
                  <div className="space-y-1.5">
                    <Label>Filament type</Label>
                    <Input
                      value={namingTypeInput}
                      onChange={(e) => setNamingTypeInput(e.target.value)}
                      placeholder="e.g. PLA Matte"
                      autoFocus
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Colour name</Label>
                  <Input
                    value={namingNameInput}
                    onChange={(e) => setNamingNameInput(e.target.value)}
                    placeholder="e.g. Bambu Black"
                    disabled={namingLocationIdx < 0}
                    autoFocus={
                      namingLocationIdx >= 0 && !namingTarget.editableType
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Hex colour</Label>
                  <div className="flex items-center gap-2">
                    <ColorSwatch hex={namingHexInput || "FFFFFF"} />
                    <Input
                      value={namingHexInput}
                      onChange={(e) => setNamingHexInput(e.target.value)}
                      placeholder="RRGGBB"
                      disabled={namingLocationIdx < 0}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNamingTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitNamingPopup}
                  disabled={
                    namingLocationIdx < 0 ||
                    nameFilamentColorMutation.isPending ||
                    !namingNameInput.trim() ||
                    !namingHexInput.trim() ||
                    (namingTarget.editableType && !namingTypeInput.trim())
                  }
                >
                  {nameFilamentColorMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={findFilamentOpen}
        onOpenChange={(o) => {
          setFindFilamentOpen(o);
          if (!o) setFindPrinterId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Can't find your filament?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Printer</Label>
              <Select
                value={findPrinterId?.toString() ?? ""}
                onValueChange={(v) => setFindPrinterId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select printer…" />
                </SelectTrigger>
                <SelectContent>
                  {(printers ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                      {p.model ? ` (${p.model})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {findPrinterId != null && (
              <div className="space-y-1">
                <Label>Slot</Label>
                {findPrinterAmsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Loading slots…
                  </p>
                ) : (findPrinterAmsQuery.data?.slots ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No slots found on this printer.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {(findPrinterAmsQuery.data?.slots ?? []).map((s, i) => {
                      const printerName =
                        printers?.find((p) => p.id === findPrinterId)?.name ??
                        `#${findPrinterId}`;
                      const label =
                        s.amsId === 255
                          ? `External Spool ${s.trayId + 1}`
                          : `AMS${s.amsId} Tray${s.trayId}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          className="w-full flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent text-left min-w-0"
                          onClick={() => {
                            openFindFilamentPopup(
                              {
                                printerId: findPrinterId,
                                printerName,
                                amsId: s.amsId,
                                trayId: s.trayId,
                              },
                              s.trayType
                                ? {
                                    type: s.trayType,
                                    hex: s.trayColor ?? "",
                                    colorName: s.colorName,
                                  }
                                : null,
                            );
                            setFindFilamentOpen(false);
                          }}
                        >
                          {s.trayColor ? (
                            <ColorSwatch hex={s.trayColor} />
                          ) : (
                            <span className="w-4 h-4 rounded-sm border border-dashed border-border shrink-0" />
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block truncate font-medium">
                              {label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {s.trayType
                                ? `${s.colorName ?? "Unnamed"} - ${s.trayType}`
                                : "No filament registered"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFindFilamentOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
