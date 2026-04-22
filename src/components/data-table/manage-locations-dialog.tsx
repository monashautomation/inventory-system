import { useState } from "react";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Check, X, Plus, ChevronRight } from "lucide-react";
import type { LocationListOutput } from "@/server/schema/location.schema";

type Location = LocationListOutput[number];

function buildTree(locations: Location[]): Location[] {
  const roots = locations.filter((l) => !l.parentId);
  const childrenOf = (parentId: string): Location[] =>
    locations.filter((l) => l.parentId === parentId);

  const flatten = (nodes: Location[], depth: number): Location[] =>
    nodes.flatMap((node) => [
      { ...node, _depth: depth } as Location & { _depth: number },
      ...flatten(childrenOf(node.id), depth + 1),
    ]);

  return flatten(roots, 0);
}

function LocationRow({
  location,
  depth,
  allLocations,
  onEdited,
  onDeleted,
}: {
  location: Location;
  depth: number;
  allLocations: Location[];
  onEdited: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(location.name);
  const [parentValue, setParentValue] = useState(location.parentId ?? "none");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchivedDelete, setConfirmArchivedDelete] = useState(false);
  const [serverArchivedItemCount, setServerArchivedItemCount] = useState<
    number | null
  >(null);

  const collectSubtreeLocationIds = (rootId: string): string[] => {
    const ids = [rootId];
    const children = allLocations.filter((loc) => loc.parentId === rootId);

    for (const child of children) {
      ids.push(...collectSubtreeLocationIds(child.id));
    }

    return ids;
  };

  const updateMut = trpc.location.update.useMutation({
    onSuccess: () => {
      toast.success("Location updated.");
      setEditing(false);
      onEdited();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.location.delete.useMutation({
    onSuccess: () => {
      toast.success("Location deleted.");
      onDeleted();
    },
    onError: (e) => {
      const marker = "ARCHIVED_DELETE_CONFIRMATION_REQUIRED:";
      if (e.message.startsWith(marker)) {
        const parsed = Number.parseInt(
          e.message.replace(marker, "").split(":")[0] ?? "",
          10,
        );
        setServerArchivedItemCount(Number.isFinite(parsed) ? parsed : null);
        setConfirmDelete(false);
        setConfirmArchivedDelete(true);
        return;
      }

      toast.error(e.message);
    },
  });

  const handleSave = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    updateMut.mutate({
      id: location.id,
      data: {
        name: trimmed,
        parentId: parentValue === "none" ? null : parentValue,
      },
    });
  };

  const handleCancel = () => {
    setNameValue(location.name);
    setParentValue(location.parentId ?? "none");
    setEditing(false);
  };

  const validParents = allLocations.filter(
    (l) =>
      l.id !== location.id && !isDescendant(l.id, location.id, allLocations),
  );

  const subtreeLocationIds = new Set(collectSubtreeLocationIds(location.id));
  const subtreeItems = allLocations
    .filter((loc) => subtreeLocationIds.has(loc.id))
    .flatMap((loc) => loc.items);
  const activeItemCount = subtreeItems.filter((item) => !item.deleted).length;
  const archivedItemCount = subtreeItems.filter((item) => item.deleted).length;

  const requestDelete = () => {
    setServerArchivedItemCount(null);

    if (archivedItemCount > 0 && activeItemCount === 0) {
      setConfirmDelete(false);
      setConfirmArchivedDelete(true);
      return;
    }

    deleteMut.mutate({ id: location.id });
    setConfirmDelete(false);
  };

  const requestDeleteWithArchivedItems = () => {
    setServerArchivedItemCount(null);
    deleteMut.mutate({
      id: location.id,
      forceDeleteArchivedItems: true,
    });
    setConfirmArchivedDelete(false);
  };

  if (editing) {
    return (
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <Input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          className="h-7 text-sm flex-1 min-w-0"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          autoFocus
        />
        <Select value={parentValue} onValueChange={setParentValue}>
          <SelectTrigger className="h-7 w-[160px] text-xs shrink-0">
            <SelectValue placeholder="No parent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No parent</SelectItem>
            {validParents.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          disabled={updateMut.isPending}
          onClick={handleSave}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/40 group"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {depth > 0 && (
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0 -ml-1" />
        )}
        <span className="text-sm flex-1 truncate">{location.name}</span>
        <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {location.children.length > 0
            ? `${location.children.length} child${location.children.length > 1 ? "ren" : ""}`
            : ""}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{location.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {location.children.length > 0
                ? `This will also delete its ${location.children.length} child location(s). All locations must be empty before they can be deleted.`
                : "This location must be empty before it can be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={requestDelete}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmArchivedDelete}
        onOpenChange={setConfirmArchivedDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete archived items in "{location.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`This location tree contains ${serverArchivedItemCount ?? archivedItemCount} archived item${(serverArchivedItemCount ?? archivedItemCount) > 1 ? "s" : ""}. If you continue, those archived items will be permanently deleted and their data will no longer be available.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={requestDeleteWithArchivedItems}
            >
              {deleteMut.isPending
                ? "Deleting…"
                : "Delete Location and Archived Items"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function isDescendant(
  candidateId: string,
  ancestorId: string,
  all: Location[],
): boolean {
  const node = all.find((l) => l.id === candidateId);
  if (!node?.parentId) return false;
  if (node.parentId === ancestorId) return true;
  return isDescendant(node.parentId, ancestorId, all);
}

function AddLocationForm({
  allLocations,
  onAdded,
}: {
  allLocations: Location[];
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("none");

  const createMut = trpc.location.create.useMutation({
    onSuccess: () => {
      toast.success("Location created.");
      setName("");
      setParentId("none");
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createMut.mutate({
      name: trimmed,
      parentId: parentId === "none" ? null : parentId,
    });
  };

  return (
    <div className="flex items-center gap-2 pt-3 border-t">
      <Input
        placeholder="New location name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 text-sm flex-1 min-w-0"
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <Select value={parentId} onValueChange={setParentId}>
        <SelectTrigger className="h-8 w-[160px] text-xs shrink-0">
          <SelectValue placeholder="No parent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No parent</SelectItem>
          {allLocations.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 shrink-0"
        disabled={!name.trim() || createMut.isPending}
        onClick={handleAdd}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add
      </Button>
    </div>
  );
}

export function ManageLocationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const listQuery = trpc.location.list.useQuery(undefined, { enabled: open });
  const locations = listQuery.data ?? [];
  const tree = buildTree(locations);

  const refetch = () => void listQuery.refetch();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Locations</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading locations…
            </p>
          ) : tree.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No locations yet. Add one below.
            </p>
          ) : (
            tree.map((loc) => (
              <LocationRow
                key={loc.id}
                location={loc}
                depth={(loc as Location & { _depth?: number })._depth ?? 0}
                allLocations={locations}
                onEdited={refetch}
                onDeleted={refetch}
              />
            ))
          )}
        </div>

        <AddLocationForm allLocations={locations} onAdded={refetch} />
      </DialogContent>
    </Dialog>
  );
}
