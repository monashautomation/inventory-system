import { validate as isValidUUID } from "uuid";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeCanvas } from "qrcode.react";
import { trpc } from "@/client/trpc";
import ErrorPage from "./Error";
import Loading from "@/components/misc/loading";
import { ImageZoom } from "@/components/ui/image-zoom";
import { useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RestockForm from "@/components/item-crud/RestockForm";
import { AdminAssignCard } from "@/components/item-crud/AdminAssignCard";
import { AdminRevokeCard } from "@/components/item-crud/AdminRevokeCard";
import { authClient } from "@/auth/client";
import { PrintButton } from "@/components/print-label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Pencil,
  X,
  Check,
  Upload,
  Trash2,
  MoreHorizontal,
  ArrowRightToLine,
  ShoppingCart,
  Link2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemStatusBadge } from "@/components/data-table/item-status-badge";
import { getLoanState } from "@/lib/loan";
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

interface ItemDetailsProps {
  passedId?: string;
  callback?: () => void;
}

const ItemDetails = ({ passedId, callback }: ItemDetailsProps) => {
  const { id } = useParams();
  const { data: session, isPending } = authClient.useSession();

  const itemId = passedId ?? id;

  const [isImgLoading, setIsImgLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false);
  const [isApplyingToGroup, setIsApplyingToGroup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use effectiveId for your logic

  if (!itemId || !isValidUUID(itemId)) {
    return (
      <ErrorPage title="Invalid Item ID" message="Your item ID is invalid." />
    );
  }

  const { data: qrData, isLoading: qrIsLoading } = trpc.qr.generateUrl.useQuery(
    {
      id: itemId,
    },
  );
  const { data, isLoading, error, refetch } = trpc.item.get.useQuery({
    id: itemId,
  });

  const { data: imageUrl, refetch: refetchImage } =
    trpc.item.getImageUrl.useQuery({ id: itemId }, { enabled: !!data?.image });

  const { data: siblingCount } = trpc.item.countByName.useQuery(
    { id: itemId },
    { enabled: !!data },
  );

  const utils = trpc.useUtils();
  const afterLoanChange = async () => {
    await refetch();
    callback?.();
    void utils.item.list.invalidate();
    void utils.itemRecord.getUserLoanedItems.invalidate();
  };
  const checkoutMut = trpc.item.checkoutCart.useMutation({
    onSuccess: async () => {
      toast.success("Checked out. It is now on loan to you.");
      await afterLoanChange();
    },
    onError: (err) => toast.error(`Could not check out: ${err.message}`),
  });
  const checkinMut = trpc.item.checkinCart.useMutation({
    onSuccess: async () => {
      toast.success("Checked in. Thanks for returning it.");
      await afterLoanChange();
    },
    onError: (err) => toast.error(`Could not check in: ${err.message}`),
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setIsImgLoading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch(`/api/items/${itemId}/image`, {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ message: "Upload failed" }));
        throw new Error(
          (err as { message?: string }).message ?? "Upload failed",
        );
      }
      await refetch();
      await refetchImage();
      toast.success("Image updated.");
      if (siblingCount && siblingCount > 0) {
        setShowGroupDialog(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleApplyToGroup = async () => {
    setIsApplyingToGroup(true);
    try {
      const res = await fetch(`/api/items/${itemId}/image/apply-to-group`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to apply image to group");
      const result = (await res.json()) as { updated: number };
      toast.success(`Image applied to ${result.updated} other item(s).`);
    } catch {
      toast.error("Failed to apply image to group.");
    } finally {
      setIsApplyingToGroup(false);
      setShowGroupDialog(false);
    }
  };

  const handleImageDelete = async () => {
    setIsUploading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/image`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      await refetch();
      await refetchImage();
      toast.success("Image removed.");
      if (siblingCount && siblingCount > 0) {
        setShowDeleteGroupDialog(true);
      }
    } catch {
      toast.error("Failed to remove image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFromGroup = async () => {
    setIsApplyingToGroup(true);
    try {
      const res = await fetch(`/api/items/${itemId}/image/apply-to-group`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove image from group");
      const result = (await res.json()) as { updated: number };
      toast.success(`Image removed from ${result.updated} other item(s).`);
    } catch {
      toast.error("Failed to remove image from group.");
    } finally {
      setIsApplyingToGroup(false);
      setShowDeleteGroupDialog(false);
    }
  };

  const onRestock = async () => {
    await refetch();
    callback?.();
  };

  if (isLoading || isPending) {
    return (
      <div className="py-10 flex justify-center">
        <Loading />
      </div>
    );
  }

  if (error) {
    return <ErrorPage title="Error Finding Item" message={error.message} />;
  }
  if (!data) {
    return (
      <ErrorPage
        title="Could Not Find Item"
        message="The item you are looking for does not exist anymore."
      />
    );
  }

  const latestRecord = data.ItemRecords?.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const isLabUse = data.stored === false;
  const isInUse = latestRecord?.loaned ?? false;
  const { state: loanState, heldByMe } = getLoanState(data, session?.user.id);
  const isAdmin = session?.user.role === "admin";
  const canCheckOut = !data.consumable && loanState === "stored";
  const canCheckIn = !data.consumable && loanState === "loaned" && heldByMe;
  const recentRecords = (data.ItemRecords ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="p-2 max-w-6xl mx-auto space-y-2">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-2">
              <div>
                <CardTitle className="text-2xl">{data?.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {data?.serial}
                  {data?.location?.name ? ` · ${data.location.name}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ItemStatusBadge state={loanState} heldByMe={heldByMe} />
                {loanState === "loaned" &&
                latestRecord?.actionBy &&
                !heldByMe ? (
                  <span className="text-sm text-muted-foreground">
                    with {latestRecord.actionBy.name}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-3">
              {data?.image && (
                <div className="relative h-20 w-20">
                  {isImgLoading && (
                    <Skeleton className="h-full w-full rounded-md bg-muted" />
                  )}
                  {imageUrl && (
                    <ImageZoom>
                      <img
                        loading="lazy"
                        src={imageUrl}
                        alt={`${data.name} preview`}
                        className={`max-h-20 rounded-md object-contain border ${isImgLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
                        onLoad={() => setIsImgLoading(false)}
                        onError={() => setIsImgLoading(false)}
                      />
                    </ImageZoom>
                  )}
                </div>
              )}

              {/* One primary action, based on what you can do with this item. */}
              {canCheckOut && (
                <Button
                  onClick={() => checkoutMut.mutate([{ itemId, quantity: 1 }])}
                  disabled={checkoutMut.isPending}
                >
                  <ShoppingCart />
                  {checkoutMut.isPending ? "Checking out..." : "Check out"}
                </Button>
              )}
              {canCheckIn && (
                <Button
                  onClick={() => checkinMut.mutate([{ itemId, quantity: 1 }])}
                  disabled={checkinMut.isPending}
                >
                  <ArrowRightToLine />
                  {checkinMut.isPending ? "Checking in..." : "Check in"}
                </Button>
              )}

              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="More actions"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={isUploading}
                        onSelect={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {data?.image ? "Replace image" : "Upload image"}
                      </DropdownMenuItem>
                      {data?.image && (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isUploading}
                          onSelect={() => void handleImageDelete()}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove image
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Information */}
            <Section title="Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow label="ID" value={data?.id} />
                <InfoRow
                  label="Location"
                  value={data?.location?.name ?? "N/A"}
                />
                {isInUse && latestRecord?.actionBy && (
                  <InfoRow
                    label="Loaned To"
                    value={latestRecord.actionBy.name}
                  />
                )}
                <InfoRow label="Cost" value={`$${data?.cost}`} />
              </div>
            </Section>

            {/* Recent loan history */}
            {!data.consumable && (
              <Section title="History">
                {recentRecords.length ? (
                  <ul className="mt-2 divide-y text-sm">
                    {recentRecords.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 py-1.5"
                      >
                        <span>
                          {r.loaned ? "Checked out" : "Returned"} by{" "}
                          {r.actionBy?.name ?? "someone"}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No loans yet.
                  </p>
                )}
              </Section>
            )}

            {/* Tags */}
            <Section title="Tags">
              <div className="flex flex-wrap gap-2 mt-2">
                {data?.tags.length ? (
                  data.tags.map((tag, i) => (
                    <Badge key={i} variant="outline">
                      {tag.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">
                    No tags assigned
                  </span>
                )}
              </div>
            </Section>

            {/* Combined Consumable & Additional Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Consumable Info */}
              {data?.consumable && (
                <Section title="Consumable Info">
                  <div className="space-y-2">
                    <InfoRow
                      label="Available Stock"
                      value={data.consumable.available}
                    />
                    <InfoRow
                      label="Total Quantity"
                      value={data.consumable.total}
                    />
                  </div>
                </Section>
              )}

              {/* Additional Info (fills empty space) 
                            <Section title="Additional Information">
                                <div className="space-y-2">
                                    <InfoRow label="Category" value={data?.category ?? 'N/A'} />
                                    <InfoRow label="Notes" value={data?.notes ?? 'None'} />
                                </div>
                            </Section>*/}
            </div>
            {/* Notes */}
            <ItemNotes itemId={itemId} data={data} onSaved={refetch} />

            {/* Timestamps */}
            <Section title="Timestamps">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow
                  label="Created At"
                  value={new Date(data.createdAt).toLocaleString()}
                />
                <InfoRow
                  label="Last Updated"
                  value={new Date(data.updatedAt).toLocaleString()}
                />
              </div>
            </Section>
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-9">
          {/* Sidebar - QR code and label printing */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="text-base">QR code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {qrIsLoading || !qrData ? (
                <Skeleton className="h-[140px] w-[140px]" />
              ) : typeof qrData === "string" ? (
                <QRCodeCanvas
                  value={qrData}
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin
                />
              ) : (
                <div className="text-destructive">
                  {qrData?.error || "Failed to load QR code"}
                </div>
              )}
              {typeof qrData === "string" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-link"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(qrData)
                      .then(() => toast.success("Link copied."))
                      .catch(() => toast.error("Could not copy the link."));
                  }}
                >
                  <Link2 />
                  Copy link
                </Button>
              )}
              <PrintButton itemId={itemId} />
            </CardContent>
          </Card>

          {session?.user.role === "admin" && data.consumable && (
            <Card>
              <CardHeader>
                <CardTitle>Restock</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <RestockForm item={data} callback={onRestock} />
              </CardContent>
            </Card>
          )}

          {session?.user.role === "admin" &&
            !data.consumable &&
            !isLabUse &&
            !isInUse && (
              <AdminAssignCard
                itemId={itemId}
                onSuccess={async () => {
                  await refetch();
                  callback?.();
                }}
              />
            )}

          {session?.user.role === "admin" &&
            !data.consumable &&
            !isLabUse &&
            isInUse &&
            latestRecord?.actionByUserId && (
              <AdminRevokeCard
                itemId={itemId}
                targetUserId={latestRecord.actionByUserId}
                onSuccess={async () => {
                  await refetch();
                  callback?.();
                }}
              />
            )}
        </div>
      </div>

      <AlertDialog
        open={showDeleteGroupDialog}
        onOpenChange={setShowDeleteGroupDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove image from all versions?</AlertDialogTitle>
            <AlertDialogDescription>
              There {siblingCount === 1 ? "is" : "are"}{" "}
              <strong>{siblingCount}</strong> other item
              {siblingCount === 1 ? "" : "s"} named &ldquo;{data?.name}&rdquo;.
              Remove the image from all of them too?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingToGroup}>
              No, just this one
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteFromGroup();
              }}
              disabled={isApplyingToGroup}
            >
              {isApplyingToGroup ? "Removing..." : "Yes, remove from all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply image to all versions?</AlertDialogTitle>
            <AlertDialogDescription>
              There {siblingCount === 1 ? "is" : "are"}{" "}
              <strong>{siblingCount}</strong> other item
              {siblingCount === 1 ? "" : "s"} named &ldquo;{data?.name}&rdquo;.
              Apply this image to all of them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingToGroup}>
              No, just this one
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleApplyToGroup();
              }}
              disabled={isApplyingToGroup}
            >
              {isApplyingToGroup ? "Applying..." : "Yes, apply to all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ItemNotesProps {
  itemId: string;
  data: {
    notes?: string | null;
    notesUpdatedAt?: Date | string | null;
    notesUpdatedBy?: { id: string; name: string } | null;
  };
  onSaved: () => void;
}

const ItemNotes = ({ itemId, data, onSaved }: ItemNotesProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.notes ?? "");

  const updateNote = trpc.item.updateNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved.");
      setEditing(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(`Failed to save note: ${err.message}`);
    },
  });

  const handleEdit = () => {
    setDraft(data.notes ?? "");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(data.notes ?? "");
  };

  const handleSave = () => {
    updateNote.mutate({ id: itemId, notes: draft });
  };

  return (
    <Section title="Notes">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Notes are visible to all users.
        </p>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[80px] resize-y"
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateNote.isPending}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={updateNote.isPending}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm whitespace-pre-wrap">
                {data.notes ?? (
                  <span className="text-muted-foreground italic">
                    No notes yet.
                  </span>
                )}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="flex-shrink-0"
                onClick={handleEdit}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </div>
            {data.notesUpdatedBy && data.notesUpdatedAt && (
              <p className="text-xs text-muted-foreground">
                Last edited by {data.notesUpdatedBy.name} on{" "}
                {new Date(data.notesUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
};

// Reusable Section Component
const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section>
    <h3 className="font-semibold text-lg mb-2">{title}</h3>
    {children}
  </section>
);

// Reusable Field Row
const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p>{value}</p>
  </div>
);

export default ItemDetails;
