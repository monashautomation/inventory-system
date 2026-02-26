import { type FormEvent, useState } from "react";
import { trpc } from "@/client/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { authClient } from "@/auth/client";

type PrinterType = "PRUSA" | "BAMBU";

interface PrinterFormState {
  name: string;
  type: PrinterType;
  ipAddress: string;
  authToken: string;
  serialNumber: string;
  webcamUrl: string;
}

const emptyForm: PrinterFormState = {
  name: "",
  type: "PRUSA",
  ipAddress: "",
  authToken: "",
  serialNumber: "",
  webcamUrl: "",
};

function PrinterFormFields({
  form,
  onChange,
}: {
  form: PrinterFormState;
  onChange: (patch: Partial<PrinterFormState>) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          placeholder="e.g. Prusa XL 01"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={form.type}
          onValueChange={(v) => onChange({ type: v as PrinterType })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PRUSA">Prusa</SelectItem>
            <SelectItem value="BAMBU">Bambu</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>IP Address</Label>
        <Input
          placeholder="e.g. 172.24.200.91"
          value={form.ipAddress}
          onChange={(e) => onChange({ ipAddress: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Auth Token / API Key</Label>
        <Input
          placeholder={
            form.type === "PRUSA" ? "PrusaLink API key" : "Bambu access code"
          }
          value={form.authToken}
          onChange={(e) => onChange({ authToken: e.target.value })}
        />
      </div>
      {form.type === "BAMBU" ? (
        <div className="space-y-2">
          <Label>Serial Number</Label>
          <Input
            placeholder="Bambu serial number"
            value={form.serialNumber}
            onChange={(e) => onChange({ serialNumber: e.target.value })}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>Webcam URL</Label>
        <Input
          placeholder="e.g. http://172.24.200.81:8080/?action=stream"
          value={form.webcamUrl}
          onChange={(e) => onChange({ webcamUrl: e.target.value })}
        />
      </div>
    </>
  );
}

function AddPrinterDialog({ onSuccess }: { onSuccess: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<PrinterFormState>({ ...emptyForm });

  const onChange = (patch: Partial<PrinterFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const createMutation = trpc.print.createPrinter.useMutation({
    onSuccess: () => {
      toast.success("Printer added successfully.");
      setIsOpen(false);
      setForm({ ...emptyForm });
      onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.ipAddress.trim()) {
      toast.error("Name and IP address are required.");
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      type: form.type,
      ipAddress: form.ipAddress.trim(),
      authToken: form.authToken.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      webcamUrl: form.webcamUrl.trim() || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add Printer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a printer</DialogTitle>
          <DialogDescription>
            Configure a new printer for the system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PrinterFormFields form={form} onChange={onChange} />
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Adding..." : "Add Printer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPrinterDialog({
  printer,
  onSuccess,
}: {
  printer: {
    id: string;
    name: string;
    type: PrinterType;
    ipAddress: string;
    authToken: string | null;
    serialNumber: string | null;
    webcamUrl: string | null;
  };
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<PrinterFormState>({
    name: printer.name,
    type: printer.type,
    ipAddress: printer.ipAddress,
    authToken: printer.authToken ?? "",
    serialNumber: printer.serialNumber ?? "",
    webcamUrl: printer.webcamUrl ?? "",
  });

  const onChange = (patch: Partial<PrinterFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const updateMutation = trpc.print.updatePrinter.useMutation({
    onSuccess: () => {
      toast.success("Printer updated.");
      setIsOpen(false);
      onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.ipAddress.trim()) {
      toast.error("Name and IP address are required.");
      return;
    }
    updateMutation.mutate({
      printerId: printer.id,
      name: form.name.trim(),
      type: form.type,
      ipAddress: form.ipAddress.trim(),
      authToken: form.authToken.trim() || null,
      serialNumber: form.serialNumber.trim() || null,
      webcamUrl: form.webcamUrl.trim() || null,
    });
  };

  // Reset form when dialog opens to pick up latest printer data
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setForm({
        name: printer.name,
        type: printer.type,
        ipAddress: printer.ipAddress,
        authToken: printer.authToken ?? "",
        serialNumber: printer.serialNumber ?? "",
        webcamUrl: printer.webcamUrl ?? "",
      });
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit printer</DialogTitle>
          <DialogDescription>
            Update the configuration for {printer.name}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PrinterFormFields form={form} onChange={onChange} />
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            className="w-full"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PrinterManagement() {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const printersQuery = trpc.print.getPrinters.useQuery();
  const printers = printersQuery.data ?? [];

  const deleteMutation = trpc.print.deletePrinter.useMutation({
    onSuccess: () => {
      toast.success("Printer deleted.");
      void printersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold">Printer Management</h1>
        <p className="mt-2 text-muted-foreground">
          You do not have permission to manage printers. Contact an admin.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Printer Management</h1>
          <p className="text-muted-foreground">
            Add, edit, or remove printers from the system.
          </p>
        </div>
        <AddPrinterDialog onSuccess={() => void printersQuery.refetch()} />
      </div>

      {printers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No printers configured yet. Click &quot;Add Printer&quot; to get
            started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {printers.map((printer) => (
            <Card key={printer.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{printer.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {printer.type} &middot; {printer.ipAddress}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Auth Token</span>
                  <span className="truncate">
                    {printer.authToken ? "••••••••" : "—"}
                  </span>
                  {printer.type === "BAMBU" ? (
                    <>
                      <span className="text-muted-foreground">Serial</span>
                      <span className="truncate">
                        {printer.serialNumber ?? "—"}
                      </span>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">Webcam</span>
                  <span className="truncate">
                    {printer.webcamUrl ? (
                      <a
                        href={printer.webcamUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <EditPrinterDialog
                    printer={printer}
                    onSuccess={() => void printersQuery.refetch()}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete printer "${printer.name}"? This cannot be undone.`,
                        )
                      ) {
                        deleteMutation.mutate({ printerId: printer.id });
                      }
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
