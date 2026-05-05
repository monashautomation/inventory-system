"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import Loading from "@/components/misc/loading";
import Items from "@/layouts/Items";
import { useCart } from "@/contexts/cart-context";
import { trpc } from "@/client/trpc";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/server/api/routers/_app";
import { Dialog, DialogContent, DialogOverlay } from "@radix-ui/react-dialog";
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
import { AddConsumableDialog } from "@/components/add-consumable-dialog";
import { TableActions } from "@/components/data-table/table-actions";
import ErrorPage from "./Error";
import { Route, Routes, useParams } from "react-router-dom";
import LocationBreadcrumb from "@/components/Location";
import ModifyItemSheet from "@/components/item-crud/ModifyItemSheet";
import { keepPreviousData } from "@tanstack/react-query";
import { authClient } from "@/auth/client";

type GetItemsOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

const Consumables = () => {
  const { itemInCart, getItem } = useCart();
  const { "*": locationPath } = useParams();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";
  const locationId = locationPath?.split("/").pop();

  // Manage pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GetItemsOutput | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<GetItemsOutput | null>(null);

  // Fetch paginated data
  const { data, isLoading, error, refetch } = trpc.item.list.useQuery(
    {
      consumable: true,
      locationId: locationId === "" ? null : locationId,
      filter: filter || undefined,
      page: pageIndex,
      pageSize,
    },
    {
      placeholderData: keepPreviousData,
      staleTime: 1000,
    },
  );

  const onRestock = async () => await refetch();

  const deleteMut = trpc.item.delete.useMutation({
    onError: (error) => {
      toast.error(`Failed to delete item: ${error.message}`);
    },
    onSuccess: async () => {
      toast.success("Item deleted successfully.");
      await refetch();
    },
  });

  // Reset pageIndex if it exceeds available pages
  useEffect(() => {
    if (data?.totalCount !== undefined && data.totalCount > 0) {
      const maxPageIndex = Math.max(
        0,
        Math.ceil(data.totalCount / pageSize) - 1,
      );
      if (pageIndex > maxPageIndex) {
        setPageIndex(maxPageIndex);
      }
    }
  }, [data?.totalCount, pageIndex, pageSize]);

  // Handle add to cart action
  const handleAddToCart = useCallback((item: GetItemsOutput) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  }, []);

  // Handle modify action
  const handleModify = useCallback((item: GetItemsOutput) => {
    setSelectedItem(item);
    setIsSheetOpen(true);
  }, []);

  // Handle delete action
  const handleDelete = useCallback((item: GetItemsOutput) => {
    setItemToDelete(item);
  }, []);

  const getCartQuantity = useCallback(
    (id: string) => getItem(id)?.quantity ?? 0,
    [getItem],
  );

  // Memoize columns to prevent re-creation on every render
  const columns = useMemo(
    () =>
      Items({
        consumable: true,
        onAddToCart: handleAddToCart,
        onModify: handleModify,
        onDelete: handleDelete,
        itemInCart,
        getCartQuantity,
        isDeleting: deleteMut.isPending,
        callback: onRestock,
        isAdmin,
      }),
    [
      handleAddToCart,
      handleModify,
      handleDelete,
      itemInCart,
      getCartQuantity,
      deleteMut.isPending,
      isAdmin,
    ],
  );

  if (isLoading && !data) {
    return (
      <div className="container mx-auto py-10 mb-10">
        <Routes>
          <Route path="*" element={<LocationBreadcrumb />} />
        </Routes>
        <div className="py-10">
          <Loading />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 mb-10">
        <Routes>
          <Route path="*" element={<LocationBreadcrumb />} />
        </Routes>
        <ErrorPage message={error.message} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 p-6 md:p-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-left">Consumables</h1>
        <p className="text-muted-foreground">
          Track and manage your consumable inventory
        </p>
      </div>

      <Routes>
        <Route path="*" element={<LocationBreadcrumb />} />
      </Routes>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        filterKey="name"
        filterValue={filter}
        onFilterChange={setFilter}
        BarComponents={(table) => (
          <TableActions
            table={table}
            onRefetch={refetch}
            defaultConsumable
            isAdmin={isAdmin}
          />
        )}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPageChange={setPageIndex}
        onPageSizeChange={setPageSize}
        totalCount={data?.totalCount}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogOverlay />
        <DialogContent>
          {selectedItem && (
            <AddConsumableDialog
              item={selectedItem}
              onClose={() => setIsDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {selectedItem && (
        <ModifyItemSheet
          item={selectedItem}
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          onSuccess={refetch}
        />
      )}

      <AlertDialog
        open={!!itemToDelete}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{itemToDelete?.name}</strong>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (itemToDelete) {
                  deleteMut.mutate({ id: itemToDelete.id });
                  setItemToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Consumables;
