import { type FormEvent, useState, useRef, useCallback } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X, File as FileIcon } from "lucide-react";

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file content."));
        return;
      }
      const [, base64] = result.split(",");
      resolve(base64 ?? "");
    };
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });

export default function PrintGcode() {
  const printersQuery = trpc.print.getPrinters.useQuery();
  const jobsQuery = trpc.print.listMyPrintJobs.useQuery();

  const uploadAndPrintMutation = trpc.print.uploadAndPrint.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.dispatchResponse ?? "File uploaded and print started.",
      );
      setSelectedFile(null);
      void jobsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const reprintMutation = trpc.print.reprintJob.useMutation({
    onSuccess: (result) => {
      toast.success(result.dispatchResponse ?? "Reprint started.");
      void jobsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const [selectedPrinterIp, setSelectedPrinterIp] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0] ?? null);
    }
  }, []);

  const statusQuery = trpc.print.getPrinterStatus.useQuery(
    { printerIpAddress: selectedPrinterIp },
    { enabled: !!selectedPrinterIp, refetchInterval: 10_000 },
  );

  const BLOCKED_PRINTER_STATES = new Set([
    "PRINTING",
    "PAUSED",
    "BUSY",
    "ATTENTION",
    "UNREACHABLE",
  ]);
  const printerBusy =
    !!statusQuery.data &&
    BLOCKED_PRINTER_STATES.has(statusQuery.data.state.toUpperCase());

  const printerOptions = printersQuery.data ?? [];
  const selectedPrinter =
    printerOptions.find((printer) => printer.ipAddress === selectedPrinterIp) ??
    null;
  const isBambu = selectedPrinter?.type === "BAMBU";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedPrinterIp) {
      toast.error("Select a printer and a file.");
      return;
    }

    const fileContentBase64 = await readFileAsBase64(selectedFile);
    await uploadAndPrintMutation.mutateAsync({
      printerIpAddress: selectedPrinterIp,
      fileName: selectedFile.name,
      fileContentBase64,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Print</h1>
        <p className="text-muted-foreground">
          Select a printer, choose a file, and hit print.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload and Print</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Printer</Label>
              <Select
                value={selectedPrinterIp}
                onValueChange={setSelectedPrinterIp}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a printer" />
                </SelectTrigger>
                <SelectContent>
                  {printerOptions.map((printer) => (
                    <SelectItem value={printer.ipAddress} key={printer.id}>
                      {printer.name} ({printer.type}) - {printer.ipAddress}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {printerOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No printers available. Add printers via the Printer Management
                  page.
                </p>
              ) : null}
              {selectedPrinter && statusQuery.data ? (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    {
                      PRINTING:
                        "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                      PAUSED:
                        "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                      BUSY: "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                      ATTENTION:
                        "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
                      UNREACHABLE:
                        "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
                      IDLE: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
                      READY:
                        "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
                      FINISHED:
                        "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
                    }[statusQuery.data.state] ??
                    "border-muted bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className="font-medium">Status:</span>{" "}
                  {statusQuery.data.stateMessage}
                </div>
              ) : null}
              {selectedPrinter && statusQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Checking printer status…
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{isBambu ? "3MF file" : "G-code file"}</Label>
              <div
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer
                  ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 bg-muted/50 hover:bg-muted"
                  }
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept={
                    isBambu
                      ? ".3mf,application/octet-stream"
                      : ".gcode,.gc,.gco,.bgcode,text/plain"
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center gap-3 relative w-full max-w-sm mx-auto p-4 rounded-md border border-border/50 bg-background/50 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 w-full">
                      <div className="rounded-md bg-primary/10 p-2.5">
                        <FileIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex flex-col items-start flex-1 overflow-hidden text-left">
                        <div
                          className="text-sm font-medium truncate w-full"
                          title={selectedFile.name}
                        >
                          {selectedFile.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove file</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="rounded-full bg-background p-4 shadow-sm border border-border/50 transition-transform group-hover:scale-105">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        Drag and drop your file here, or{" "}
                        <span className="text-primary hover:underline">
                          click to browse
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Supports{" "}
                        {isBambu ? ".3mf" : ".gcode, .gc, .gco, .bgcode"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                uploadAndPrintMutation.isPending ||
                printersQuery.isLoading ||
                printerOptions.length === 0 ||
                !selectedFile ||
                !selectedPrinterIp ||
                (!!selectedPrinterIp && statusQuery.isLoading) ||
                printerBusy
              }
            >
              {uploadAndPrintMutation.isPending
                ? "Printing..."
                : statusQuery.isLoading && selectedPrinterIp
                  ? "Checking printer\u2026"
                  : printerBusy
                    ? "Printer busy"
                    : "Upload and Print"}
            </Button>
          </form>

          {jobsQuery.data && jobsQuery.data.length > 0 ? (
            <div className="mt-6 space-y-2 border-t pt-4">
              <Label>Recent print jobs</Label>
              <div className="space-y-2">
                {jobsQuery.data.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {job.originalFilename}
                      </div>
                      <div className="text-muted-foreground">
                        {job.printer.name} ({job.printer.type}) &bull;{" "}
                        {job.status}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        !selectedPrinterIp ||
                        printerBusy ||
                        (!!selectedPrinterIp && statusQuery.isLoading) ||
                        reprintMutation.isPending
                      }
                      onClick={() =>
                        reprintMutation.mutate({
                          printJobId: job.id,
                          printerIpAddress: selectedPrinterIp,
                        })
                      }
                    >
                      {reprintMutation.isPending &&
                      reprintMutation.variables?.printJobId === job.id
                        ? "Reprinting\u2026"
                        : "Reprint"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
