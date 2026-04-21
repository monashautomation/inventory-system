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
import { TableActions } from "@/components/data-table/table-actions";
import ErrorPage from "./Error";
import { Route, Routes, useParams } from "react-router-dom";
import LocationBreadcrumb from "@/components/Location";
import ModifyItemSheet from "@/components/item-crud/ModifyItemSheet";
import { keepPreviousData } from "@tanstack/react-query";

type GetItemsOutput = inferProcedureOutput<
  AppRouter["item"]["list"]
>["items"][number];

const Assets = () => {
  const { addItem, itemInCart, removeItem } = useCart();
  const { "*": locationPath } = useParams();
  const locationId = locationPath?.split("/").pop();

  // Manage pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState("");

  // Manage Modify Sheet state
  const [selectedItem, setSelectedItem] = useState<GetItemsOutput | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Fetch paginated data
  const { data, isLoading, error, refetch } = trpc.item.list.useQuery(
    {
      consumable: false,
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

  // Handle adding item to cart
  const handleAddToCart = useCallback(
    (item: GetItemsOutput) => {
      if (item) {
        addItem({ ...item, quantity: 1 });
        toast.success("Item added to cart.");
      }
    },
    [addItem],
  );

  // Handle removing item from cart
  const handleRemoveFromCart = useCallback(
    (id: string) => {
      try {
        removeItem(id);
        toast.success("Item removed from cart.");
      } catch (error) {
        console.error("Failed to remove item:", error);
        toast.error("Failed to remove item from cart.");
      }
    },
    [removeItem],
  );

  // Handle cart toggle
  const handleCartToggle = useCallback(
    (item: GetItemsOutput) => {
      if (itemInCart(item.id)) {
        handleRemoveFromCart(item.id);
      } else {
        handleAddToCart(item);
      }
    },
    [itemInCart, handleAddToCart, handleRemoveFromCart],
  );

  // Handle modify action
  const handleModify = useCallback((item: GetItemsOutput) => {
    setSelectedItem(item);
    setIsSheetOpen(true);
  }, []);

  // Handle delete action
  const handleDelete = useCallback(
    (item: GetItemsOutput) => {
      deleteMut.mutate({ id: item.id });
    },
    [deleteMut],
  );

  // Memoize columns to prevent re-creation on every render
  const columns = useMemo(
    () =>
      Items({
        consumable: false,
        onAddToCart: handleCartToggle,
        onModify: handleModify,
        onDelete: handleDelete,
        itemInCart,
        isDeleting: deleteMut.isPending,
      }),
    [
      handleCartToggle,
      handleModify,
      handleDelete,
      itemInCart,
      deleteMut.isPending,
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
    <div className="container py-3 p-6 md:p-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-left">Assets</h1>
        <p className="text-muted-foreground">Manage your inventory of assets</p>
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
          <TableActions table={table} onRefetch={refetch} />
        )}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPageChange={setPageIndex}
        onPageSizeChange={setPageSize}
        totalCount={data?.totalCount}
      />

      {selectedItem && (
        <ModifyItemSheet
          item={selectedItem}
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          onSuccess={refetch}
        />
      )}
    </div>
  );
};

export default Assets;
