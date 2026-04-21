import { validate as isValidUUID } from "uuid";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeCanvas } from "qrcode.react";
import { trpc } from "@/client/trpc";
import ErrorPage from "./Error";
import Loading from "@/components/misc/loading";
import { ImageZoom } from "@/components/ui/image-zoom";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import RestockForm from "@/components/item-crud/RestockForm";
import { authClient } from "@/auth/client";
import { PrintButton } from "@/components/print-label";

interface ItemDetailsProps {
  passedId?: string;
  callback?: () => void;
}

const ItemDetails = ({ passedId, callback }: ItemDetailsProps) => {
  const { id } = useParams();
  const { data: session, isPending } = authClient.useSession();

  const itemId = passedId ?? id;

  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const [isImgLoading, setIsImgLoading] = useState(true);

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
            {data?.image && (
              <div className="relative h-24 w-24">
                {isImgLoading && (
                  <Skeleton className="h-full w-full rounded-md bg-muted" />
                )}
                <ImageZoom>
                  <img
                    loading="lazy"
                    src={imageSrc ?? data.image}
                    alt={`${data.name} preview`}
                    className={`max-h-24 rounded-md object-contain border ${isImgLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
                    onLoad={() => setIsImgLoading(false)}
                    onError={() => {
                      setImageSrc("/path/to/fallback-image.jpg");
                      setIsImgLoading(false);
                    }}
                  />
                </ImageZoom>
              </div>
            )}
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
                    <Badge variant={data?.stored ? "default" : "secondary"}>
                      {data?.stored ? "Stored" : "Not Stored"}
                    </Badge>
                  }
                />
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
        </div>
      </div>
    </div>
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
