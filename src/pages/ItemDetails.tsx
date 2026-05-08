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
import { Pencil, X, Check, Upload, Trash2 } from "lucide-react";

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    } catch {
      toast.error("Failed to remove image.");
    } finally {
      setIsUploading(false);
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
  const statusLabel = isLabUse ? "Lab Use" : isInUse ? "On Loan" : "In Storage";

  return (
    <div className="p-2 max-w-6xl mx-auto space-y-2">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{data?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Serial: {data?.serial}
              </p>
            </div>

            {/* Image next to Serial */}
            <div className="flex flex-col items-end gap-2">
              {data?.image && (
                <div className="relative h-24 w-24">
                  {isImgLoading && (
                    <Skeleton className="h-full w-full rounded-md bg-muted" />
                  )}
                  {imageUrl && (
                    <ImageZoom>
                      <img
                        loading="lazy"
                        src={imageUrl}
                        alt={`${data.name} preview`}
                        className={`max-h-24 rounded-md object-contain border ${isImgLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
                        onLoad={() => setIsImgLoading(false)}
                        onError={() => setIsImgLoading(false)}
                      />
                    </ImageZoom>
                  )}
                </div>
              )}
              {session?.user.role === "admin" && (
                <div className="flex gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    {data?.image ? "Replace" : "Upload Image"}
                  </Button>
                  {data?.image && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isUploading}
                      onClick={handleImageDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
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
                <InfoRow
                  label="Status"
                  value={
                    <Badge
                      variant={
                        isLabUse
                          ? "default"
                          : isInUse
                            ? "destructive"
                            : "secondary"
                      }
                      className={
                        isLabUse
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : ""
                      }
                    >
                      {statusLabel}
                    </Badge>
                  }
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
          {/* Sidebar - QR Code */}
          <Card className="lg:col-span-1 h-fit sticky top-6">
            <CardHeader>
              <CardTitle>Scan QR Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {qrIsLoading || !qrData ? (
                <Skeleton className="h-[180px] w-[180px]" />
              ) : typeof qrData === "string" ? (
                <QRCodeCanvas
                  value={qrData}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin
                />
              ) : (
                <div className="text-red-500">
                  {qrData?.error || "Failed to load QR code"}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2 break-all text-center">
                {data.id}
              </p>
            </CardContent>
          </Card>

          <PrintButton itemId={itemId} />

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
