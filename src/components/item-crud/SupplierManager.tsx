import { useState } from "react";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Star, StarOff, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SupplierManagerProps {
  consumableId: string;
}

export default function SupplierManager({
  consumableId,
}: SupplierManagerProps) {
  const utils = trpc.useUtils();
  const { data: suppliers, isLoading } =
    trpc.consumableSupplier.listForConsumable.useQuery({ consumableId });

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = () =>
    utils.consumableSupplier.listForConsumable.invalidate({ consumableId });

  const createMut = trpc.consumableSupplier.create.useMutation({
    onSuccess: () => {
      toast.success("Supplier added");
      setName("");
      setUrl("");
      setSku("");
      void refresh();
    },
    onError: (e) => toast.error("Add failed", { description: e.message }),
  });

  const updateMut = trpc.consumableSupplier.update.useMutation({
    onSuccess: () => {
      toast.success("Supplier updated");
      setEditId(null);
      setName("");
      setUrl("");
      setSku("");
      void refresh();
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const deleteMut = trpc.consumableSupplier.delete.useMutation({
    onSuccess: () => {
      toast.success("Supplier removed");
      void refresh();
    },
    onError: (e) => toast.error("Delete failed", { description: e.message }),
  });

  const setPrimaryMut = trpc.consumableSupplier.setPrimary.useMutation({
    onSuccess: () => {
      toast.success("Primary updated");
      void refresh();
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const startEdit = (s: {
    id: string;
    name: string;
    url: string;
    sku: string | null;
  }) => {
    setEditId(s.id);
    setName(s.name);
    setUrl(s.url);
    setSku(s.sku ?? "");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      toast.error("Name and URL required");
      return;
    }
    if (editId) {
      updateMut.mutate({
        id: editId,
        data: { name: name.trim(), url: url.trim(), sku: sku.trim() || null },
      });
    } else {
      createMut.mutate({
        consumableId,
        name: name.trim(),
        url: url.trim(),
        sku: sku.trim() || null,
        isPrimary: false,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <Label className="text-base">Suppliers</Label>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {suppliers && suppliers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No suppliers yet. Add one below.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {suppliers?.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-md border p-2",
              s.isPrimary &&
                "border-amber-400/60 bg-amber-50/30 dark:bg-amber-900/10",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              title={s.isPrimary ? "Unset as primary" : "Set as primary"}
              disabled={setPrimaryMut.isPending}
              onClick={() =>
                setPrimaryMut.mutate({
                  consumableId,
                  supplierId: s.isPrimary ? null : s.id,
                })
              }
            >
              {s.isPrimary ? (
                <Star className="size-4 fill-amber-400 text-amber-400" />
              ) : (
                <StarOff className="size-4 opacity-50" />
              )}
            </Button>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-medium truncate">{s.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {s.url}
                {s.sku ? ` · SKU ${s.sku}` : ""}
              </span>
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open supplier link"
            >
              <ExternalLink className="size-4" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => startEdit(s)}
              title="Edit"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate({ id: s.id })}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 rounded-md border p-3"
      >
        <Label className="text-sm">
          {editId ? "Edit supplier" : "Add supplier"}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="SKU (optional)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>
        <Input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          {editId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditId(null);
                setName("");
                setUrl("");
                setSku("");
              }}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={createMut.isPending || updateMut.isPending}
          >
            {editId ? "Save" : "Add supplier"}
          </Button>
        </div>
      </form>
    </div>
  );
}
