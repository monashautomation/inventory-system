import { type FormEvent, useState } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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

  const uploadMutation = trpc.print.uploadAndStore.useMutation({
    onSuccess: (result) => {
      setLastStoredJob({
        id: result.id,
        originalFilename: result.originalFilename,
        storedFilename: result.storedFilename,
        status: result.status,
      });
      toast.success("G-code uploaded to printer, hashed, and stored locally.");
      void jobsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const startPrintMutation = trpc.print.startStoredPrint.useMutation({
    onSuccess: (result) => {
      setLastStoredJob((prev) =>
        prev && prev.id === result.id ? { ...prev, status: result.status } : prev,
      );
      toast.success(result.dispatchResponse ?? "Print start command sent.");
      void jobsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const [selectedPrinterIp, setSelectedPrinterIp] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastStoredJob, setLastStoredJob] = useState<{
    id: string;
    originalFilename: string;
    storedFilename: string;
    status: string;
  } | null>(null);

  const printerOptions = printersQuery.data ?? [];

  const submitUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedPrinterIp) {
      toast.error("Select a printer and a .gcode file.");
      return;
    }

    const fileContentBase64 = await readFileAsBase64(selectedFile);
    await uploadMutation.mutateAsync({
      printerIpAddress: selectedPrinterIp,
      fileName: selectedFile.name,
      fileContentBase64,
    });
  };

  const startStoredPrint = async () => {
    if (!lastStoredJob) {
      toast.error("Upload and store a file first.");
      return;
    }

    await startPrintMutation.mutateAsync({
      printJobId: lastStoredJob.id,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">G-code Printing</h1>
        <p className="text-muted-foreground">
          Upload a G-code/BGCode file to the printer, hash and archive it locally, then start printing as a separate step.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload to printer, store, then print</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitUpload} className="space-y-4">
            <div className="space-y-2">
              <Label>Printer</Label>
              <Select value={selectedPrinterIp} onValueChange={setSelectedPrinterIp}>
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
                  No printers are available. Printers must be configured in the backend/database first.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>G-code file</Label>
              <Input
                type="file"
                accept=".gcode,.gc,.gco,.bgcode,text/plain"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              type="submit"
              disabled={uploadMutation.isPending || printersQuery.isLoading || printerOptions.length === 0}
            >
              Upload to Printer, Hash, and Store
            </Button>
          </form>

          <div className="mt-6 space-y-3 border-t pt-4">
            <div className="space-y-1">
              <Label>Stored file ready to start</Label>
              <p className="text-sm text-muted-foreground">
                {lastStoredJob
                  ? `${lastStoredJob.originalFilename} (stored as ${lastStoredJob.storedFilename}, status=${lastStoredJob.status})`
                  : "No file uploaded in this session yet."}
              </p>
            </div>
            <Button
              type="button"
              onClick={startStoredPrint}
              disabled={!lastStoredJob || startPrintMutation.isPending}
            >
              Start Print (Stored File)
            </Button>
          </div>

          {jobsQuery.data && jobsQuery.data.length > 0 ? (
            <div className="mt-6 space-y-2 border-t pt-4">
              <Label>Recent print jobs</Label>
              <div className="space-y-2">
                {jobsQuery.data.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="text-sm">
                      <div>{job.originalFilename}</div>
                      <div className="text-muted-foreground">
                        {job.printer.name} ({job.printer.type}) • {job.status}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={startPrintMutation.isPending}
                      onClick={() =>
                        startPrintMutation.mutate({
                          printJobId: job.id,
                        })
                      }
                    >
                      Start Print
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
