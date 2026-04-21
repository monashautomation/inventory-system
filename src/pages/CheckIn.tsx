import { trpc } from "@/client/trpc";
import CheckinItem from "@/components/checkin/CheckinItem";
import Loading from "@/components/misc/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormField } from "@/components/ui/form";
import { QRScanner } from "@/components/ui/qr-scanner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

export type CheckinForm = z.infer<typeof checkinFormSchema>;

const checkinFormSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().nonempty(),
      quantity: z.number().nonnegative().default(1).nonoptional(),
    }),
  ),
});

export default function CheckIn() {
  const {
    data: loanedItems,
    isLoading,
    error,
  } = trpc.itemRecord.getUserLoanedItems.useQuery();

  const checkinMut = trpc.item.checkinCart.useMutation({
    onSuccess: (data) => {
      toast.success("Items checked out successfully");
      console.log("Success response:", data);
    },
    onError: (error) => {
      toast.error(`Failed to check in items: ${error.message}`);
    },
  });

  const form = useForm<z.infer<typeof checkinFormSchema>>({
    resolver: zodResolver(checkinFormSchema),
    defaultValues: {
      items: [],
    },
  });

  const selectedCount = form.watch("items").length;

  const onSubmit = (values: z.infer<typeof checkinFormSchema>) => {
    console.log("Checking in items:", values.items);
    checkinMut.mutate(values.items);
  };

  const handleQRScan = (qrData: string) => {
    // Extract item ID from QR code (assuming QR contains item ID)
    const itemId = qrData.trim();

    // Check if this item is in the loaned items list
    const loanedItem = safeLoanedItems.find((item) => item.itemId === itemId);

    if (loanedItem) {
      // Add to form if not already selected
      const currentItems = form.getValues("items");
      const isAlreadySelected = currentItems.some(
        (item) => item.itemId === itemId,
      );

      if (!isAlreadySelected) {
        form.setValue("items", [...currentItems, { itemId, quantity: 1 }]);
        toast.success(`Added ${loanedItem.item.name} to check-in list`);
      } else {
        toast.info(`${loanedItem.item.name} is already selected for check-in`);
      }
    } else {
      toast.error("Item not found in your loaned items");
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="container mx-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-destructive mb-4">
              Error Loading Items
            </h1>
            <p className="text-muted-foreground mb-4">
              {error.message ?? "Failed to load your loaned items"}
            </p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  // Ensure loanedItems is always an array
  const safeLoanedItems = loanedItems ?? [];

  return (
    <div className="min-h-screen bg-background py-3 p-6 md:p-8">
      {/* Header Section */}
      <div className="border-b">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-left">Check In</h1>
          <p className="text-muted-foreground">Return your loaned items</p>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-4 py-6 md:px-6 lg:px-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Items List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Your Loaned Items
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({safeLoanedItems.length} items)
                  </span>
                </h2>
                <QRScanner
                  disabled={true}
                  onScan={handleQRScan}
                  title="Scan Item QR Code"
                  description="Scan a QR code to quickly add an item to your check-in list"
                />
              </div>

              {safeLoanedItems.length === 0 ? (
                <Card className="border-dashed p-12">
                  <div className="text-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mx-auto mb-4 text-muted-foreground"
                    >
                      <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                      <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z" />
                      <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8" />
                    </svg>
                    <h3 className="mb-1 font-semibold">No items loaned</h3>
                    <p className="text-sm text-muted-foreground">
                      You don't have any items currently loaned out.
                    </p>
                  </div>
                </Card>
              ) : (
                <FormField
                  control={form.control}
                  name="items"
                  render={() => (
                    <div className="grid gap-3">
                      {safeLoanedItems.map((record) => (
                        <CheckinItem
                          key={record.id}
                          record={record}
                          form={form}
                        />
                      ))}
                    </div>
                  )}
                />
              )}
            </div>

            {/* Sticky Submit Footer */}
            {safeLoanedItems.length > 0 && (
              <div className="sticky bottom-4 rounded-lg border bg-card p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {selectedCount === 0 ? (
                      "Select items to check in"
                    ) : (
                      <>
                        <span className="font-medium text-foreground">
                          {selectedCount}
                        </span>{" "}
                        item{selectedCount !== 1 ? "s" : ""} selected
                      </>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={selectedCount === 0}
                    size="lg"
                  >
                    Check In Items
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}
