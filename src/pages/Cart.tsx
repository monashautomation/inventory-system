import { CartDialogItem } from "@/components/cart/cart-item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCart } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { QRScanner } from "@/components/ui/qr-scanner";
import { ShoppingCart, Trash2, PackageOpen } from "lucide-react";
import { formSchema, type CartForm } from "@/components/cart/cart-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/client/trpc";

export default function Cart() {
  const { items, clearCart, checkout, addItem, itemInCart } = useCart();
  const [qrCode, setQrCode] = useState<string>(""); // State to store scanned QR code

  // tRPC query at the top level, only runs when qrCode is not null
  const { data, isLoading, error } = trpc.qr.scan.useQuery(
    { url: qrCode }, // Non-null assertion since enabled ensures qrCode exists
    {
      enabled: qrCode !== "", // Only run query when qrCode is set
      retry: false, // Optional: Prevent retries on failure
    },
  );

  const form = useForm<CartForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      items: [],
    },
  });

  useEffect(() => {
    const formItems = items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }));

    form.setValue("items", formItems);
  }, [items, form]);

  const onSubmit = (data: CartForm) => {
    console.log("Cart Payload", data);
    checkout();
  };

  const handleQRScan = (qrData: string) => {
    setQrCode(qrData); // Trigger the query by setting qrCode
  };
  // Handle the query result in a useEffect
  useEffect(() => {
    if (qrCode === "") return; // Skip if no QR code

    if (isLoading) {
      toast.info("Fetching item details...");
      return;
    }

    // Only process data or error after loading is complete
    if (error) {
      toast.error(error.message || "Failed to process QR code");
      setQrCode("");
      return;
    }

    if (!data) {
      toast.error("No item found for this QR code");
      setQrCode("");
      return;
    }

    if ("ok" in data) {
      toast.error(data.error || "Invalid QR code data");
      setQrCode("");
      return;
    }

    if (itemInCart(data.id)) {
      toast.info("Item is already in your cart");
      setQrCode("");
      return;
    }

    // Add item to cart

    addItem({ ...data, quantity: 1 });
    toast.success("Item added to cart");
    setQrCode("");
  }, [data, isLoading, error, itemInCart, addItem, qrCode]);

  const getFormIndex = (itemId: string) => {
    return items.findIndex((item) => item.id === itemId);
  };

  // Calculate total items
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShoppingCart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Your Cart</h1>
              <p className="text-sm text-muted-foreground">
                {totalItems} {totalItems === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <QRScanner
              onScan={handleQRScan}
              title="Scan Item QR Code"
              description="Scan a QR code to quickly add an item to your cart"
            />
            {items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Shopping Cart?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {items.length} items from your cart.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clearCart}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear Cart
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <Separator />

        {/* Empty State */}
        {items.length === 0 ? (
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="mx-auto w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
              <PackageOpen className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
            <p className="text-muted-foreground mb-6">
              Looks like you haven't added anything to your cart yet
            </p>
            <Button size="lg">Continue Shopping</Button>
          </div>
        ) : (
          /* Items List */
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="py-6 space-y-6">
                <div className="rounded-lg border bg-card p-4 md:p-6 shadow-sm">
                  <div className="space-y-5">
                    {items.map((item, index) => (
                      <div key={`${item.id}-${index}`}>
                        <CartDialogItem
                          item={item}
                          index={getFormIndex(item.id)}
                          form={form}
                        />
                        {index < items.length - 1 && (
                          <Separator className="my-5" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <Button className="w-full md:w-auto" size="lg" type="submit">
                    Proceed to Checkout
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
