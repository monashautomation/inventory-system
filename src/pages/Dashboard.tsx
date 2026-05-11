"use client";

import { Link } from "react-router-dom";
import { authClient } from "@/auth/client";
import { trpc } from "@/client/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartBarDynamic } from "@/components/charts/dynamic-charts";

import {
  AlertTriangle,
  Archive,
  Bell,
  ChevronRight,
  Clock,
  Package,
  PackageSearch,
  ShoppingBag,
} from "lucide-react";

import type { RequestStatusType } from "@/server/schema/consumableRequest.schema";

const statusVariant: Record<
  RequestStatusType,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  },
  ORDERED: {
    label: "Ordered",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  RECEIVED: {
    label: "Received",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
};

function StatusBadge({ status }: { status: RequestStatusType }) {
  const v = statusVariant[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}

function StatCard({
  title,
  value,
  icon: Icon,
  highlight,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  highlight?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4 text-muted-foreground", highlight)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ViewAllLink({ to }: { to: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={to} className="flex items-center gap-1 text-xs">
        View all <ChevronRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}

function MyRequestsCard() {
  const { data, isLoading } = trpc.consumableRequest.listMine.useQuery({
    page: 0,
    pageSize: 5,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">My Recent Requests</CardTitle>
        <ViewAllLink to="/my-requests" />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : !data?.items.length ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            No requests yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">
                    {req.consumable.item?.name}
                  </TableCell>
                  <TableCell className="text-right">{req.quantity}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {fmt(req.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MyLoansCard() {
  const { data: loans, isLoading } =
    trpc.itemRecord.getUserLoanedItems.useQuery();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">My Active Loans</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : !loans?.length ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            No active loans.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">
                    {loan.item.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {loan.item.serial}
                  </TableCell>
                  <TableCell className="text-right">{loan.loanedQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AdminPendingRequestsCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.consumableRequest.list.useQuery({
    status: "PENDING",
    page: 0,
    pageSize: 5,
  });

  const updateMut = trpc.consumableRequest.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Marked as ordered");
      void utils.consumableRequest.list.invalidate();
      void utils.consumableRequest.pendingCount.invalidate();
      void utils.dashboard.getRequestStatusCounts.invalidate();
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const total = data?.totalCount ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          Pending Requests
          {total > 0 && <span className="ml-2 text-amber-600">({total})</span>}
        </CardTitle>
        <ViewAllLink to="/consumables/requests" />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : !data?.items.length ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            No pending requests.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">
                    {req.consumable.item?.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {req.requestedBy.name}
                  </TableCell>
                  <TableCell className="text-right">{req.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={updateMut.isPending}
                      onClick={() =>
                        updateMut.mutate({ id: req.id, status: "ORDERED" })
                      }
                    >
                      Order
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LowStockCard() {
  const { data: items, isLoading } =
    trpc.dashboard.getLowStockConsumables.useQuery();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <CardTitle className="text-base">Low Stock</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : !items?.length ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            All consumables sufficiently stocked.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.item?.name}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold",
                      c.available === 0 ? "text-destructive" : "text-amber-600",
                    )}
                  >
                    {c.available}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.minStock}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const ACTION_LABELS: Record<string, string> = {
  REQUEST_CREATED: "Request created",
  REQUEST_STATUS_CHANGED: "Status changed",
  REQUEST_CANCELLED: "Request cancelled",
  REQUEST_RECEIVED: "Request received",
};

function AuditLogCard() {
  const { data, isLoading } = trpc.auditLog.list.useQuery({
    page: 0,
    pageSize: 8,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <ViewAllLink to="/audit-log" />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : !data?.items.length ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            No activity yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.actor?.name ?? "System"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {fmt(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export const formatConsumableTotalCost = (totalCost: number): string =>
  `$${totalCost.toFixed(2)}`;

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const { data: myPending } = trpc.consumableRequest.myPendingCount.useQuery();
  const { data: unread } = trpc.notification.unreadCount.useQuery();
  const { data: loans } = trpc.itemRecord.getUserLoanedItems.useQuery();

  const { data: statusCounts } = trpc.dashboard.getRequestStatusCounts.useQuery(
    undefined,
    { enabled: isAdmin },
  );
  const { data: inventoryStats } = trpc.dashboard.getItemStatusStats.useQuery(
    undefined,
    { enabled: isAdmin },
  );
  const { data: inventoryByLocation } =
    trpc.dashboard.getInventoryByLocation.useQuery(undefined, {
      enabled: isAdmin,
    });

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {session?.user.name && (
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}.
          </p>
        )}
      </div>

      {/* User stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          title="My Pending Requests"
          value={myPending?.count ?? 0}
          icon={ShoppingBag}
          highlight={myPending?.count ? "text-amber-500" : undefined}
        />
        <StatCard
          title="My Active Loans"
          value={loans?.length ?? 0}
          icon={Package}
        />
        <StatCard
          title="Unread Notifications"
          value={unread?.count ?? 0}
          icon={Bell}
          highlight={unread?.count ? "text-blue-500" : undefined}
        />
      </div>

      {/* User cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <MyRequestsCard />
        <MyLoansCard />
      </div>

      {/* Admin section */}
      {isAdmin && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Admin Overview
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              title="Pending Requests"
              value={statusCounts?.PENDING ?? 0}
              icon={Clock}
              highlight={statusCounts?.PENDING ? "text-amber-500" : undefined}
            />
            <StatCard
              title="Ordered"
              value={statusCounts?.ORDERED ?? 0}
              icon={ShoppingBag}
              highlight="text-blue-500"
            />
            <StatCard
              title="Total Items"
              value={inventoryStats?.total ?? 0}
              icon={Archive}
            />
            <StatCard
              title="Consumable Units"
              value={inventoryStats?.available ?? 0}
              icon={PackageSearch}
            />
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <AdminPendingRequestsCard />
            <LowStockCard />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AuditLogCard />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Inventory by Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartBarDynamic
                  data={inventoryByLocation ?? []}
                  dataKey="itemCount"
                  nameKey="locationName"
                  color="#10b981"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
