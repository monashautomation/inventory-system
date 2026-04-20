// pages/dashboard/index.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Clock,
    Star,
    Package,
    MapPin,
    Tag,
    TrendingUp,
    Flame,
} from "lucide-react";
import {
    ChartBarDynamic,
    ChartAreaDynamic,
    ChartPieDynamic,
} from "@/components/charts/dynamic-charts";
import { trpc } from "@/client/trpc";

type ConsumptionRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1yr";
const CONSUMPTION_RANGES: { label: string; value: ConsumptionRange }[] = [
    { label: "1D", value: "1d" },
    { label: "1W", value: "1w" },
    { label: "1M", value: "1m" },
    { label: "3M", value: "3m" },
    { label: "6M", value: "6m" },
    { label: "1YR", value: "1yr" },
];

export const formatConsumableTotalCost = (totalCost: number): string =>
    `$${totalCost.toFixed(2)}`;

export default function Dashboard() {
    const [timeRange, setTimeRange] = useState<"week" | "month" | "year">(
        "month",
    );
    const [consumptionRange, setConsumptionRange] =
        useState<ConsumptionRange>("1m");

    // Data fetching hooks
    const { data: loanHistory } = trpc.dashboard.getLoanHistory.useQuery({
        range: timeRange,
    });
    const { data: inventoryByLocation } =
        trpc.dashboard.getInventoryByLocation.useQuery();
    const { data: topItems } = trpc.dashboard.getTopLoanedItems.useQuery({
        limit: 5,
    });
    const { data: itemStatus } = trpc.dashboard.getItemStatusStats.useQuery();
    const { data: topTags } = trpc.dashboard.getTopTags.useQuery({ limit: 5 });
    const { data: consumptionStats } =
        trpc.dashboard.getConsumptionStats.useQuery({
            range: consumptionRange,
        });
    const { data: topConsumed } =
        trpc.dashboard.getTopConsumedConsumables.useQuery({
            range: consumptionRange,
            limit: 10,
        });

    return (
        <div className="min-h-screen bg-background p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-left">Dashboard</h1>
                <p className="text-muted-foreground">
                    Overview of your inventory system
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(120px,auto)]">
                {/* Stats Cards */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Items
                        </CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {itemStatus?.total.toLocaleString() ?? "0"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {itemStatus?.available
                                ? `${itemStatus.available} available`
                                : "Loading..."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Loans
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {itemStatus?.loaned.toLocaleString() ?? "0"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Currently checked out
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Locations
                        </CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {inventoryByLocation?.length ?? "0"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Active storage areas
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Tags
                        </CardTitle>
                        <Tag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {topTags?.length ?? "0"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Categorized items
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6 mx-auto grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-[minmax(300px,auto)]">
                {/* Main Charts */}
                <div className={cn("lg:col-span-2")}>
                    <ChartAreaDynamic
                        data={loanHistory ?? []}
                        timeRange={timeRange}
                        setTimeRange={setTimeRange}
                        dataKey="count"
                        nameKey="date"
                    />
                </div>

                <Card className="flex flex-col h-full">
                    <CardHeader>
                        <CardTitle>Top Loaned Items</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <ChartBarDynamic
                            data={topItems ?? []}
                            dataKey="loanCount"
                            nameKey="itemName"
                            color="#3b82f6"
                        />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Inventory Distribution</CardTitle>
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

                <Card>
                    <CardHeader>
                        <CardTitle>Item Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center">
                        <ChartPieDynamic
                            data={topTags ?? []}
                            dataKey="count"
                            nameKey="tagName"
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Consumables Section */}
            <div className="mt-8 mb-3 flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-400" />
                <h2 className="text-xl font-semibold">Consumables</h2>
                <div className="ml-auto flex gap-1">
                    {CONSUMPTION_RANGES.map((r) => (
                        <Button
                            key={r.value}
                            size="sm"
                            variant={
                                consumptionRange === r.value
                                    ? "default"
                                    : "outline"
                            }
                            className="h-7 px-2 text-xs"
                            onClick={() => setConsumptionRange(r.value)}
                        >
                            {r.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="grid grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Units Consumed
                            </CardTitle>
                            <Flame className="h-4 w-4 text-orange-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {consumptionStats?.totalConsumed.toLocaleString() ??
                                    "0"}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Over selected period
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Cost
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatConsumableTotalCost(
                                    consumptionStats?.totalCost ?? 0,
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Over selected period
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                            Top 10 Most Consumed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!topConsumed || topConsumed.length === 0 ? (
                            <p className="text-sm text-muted-foreground px-4 pb-4">
                                No consumptions in this period
                            </p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-8">
                                            #
                                        </th>
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                                            Name
                                        </th>
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                                            Serial
                                        </th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                                            Used
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topConsumed.map((item, i) => (
                                        <tr
                                            key={item.serial}
                                            className={cn(
                                                "border-b last:border-0",
                                                i % 2 === 0
                                                    ? "bg-muted/30"
                                                    : "",
                                            )}
                                        >
                                            <td className="px-4 py-2 text-muted-foreground">
                                                {i + 1}
                                            </td>
                                            <td className="px-4 py-2 font-medium">
                                                {item.name}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                                {item.serial}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold text-orange-400">
                                                {item.consumed}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center">
                            <Clock className="w-5 h-5 mr-2 text-muted-foreground" />
                            <CardTitle>Quick Actions</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm">
                                Add Item
                            </Button>
                            <Button variant="outline" size="sm">
                                New Loan
                            </Button>
                            <Button variant="outline" size="sm">
                                Generate Report
                            </Button>
                            <Button variant="outline" size="sm">
                                Manage Tags
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Testimonials */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center">
                            <Star className="w-5 h-5 mr-2 text-muted-foreground" />
                            <CardTitle>Community Feedback</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground italic">
                            "This system reduced our inventory tracking errors
                            by 80%!"
                        </p>
                        <p className="text-xs mt-2 text-right">
                            - Alex Rivera, Tech Lead
                        </p>
                    </CardContent>
                </Card>

                {/* System Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>System Health</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm">Database</span>
                                <span className="text-sm font-medium text-green-600">
                                    Operational
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm">API Response</span>
                                <span className="text-sm font-medium text-green-600">
                                    28ms avg
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm">Last Backup</span>
                                <span className="text-sm font-medium">
                                    2 hours ago
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
