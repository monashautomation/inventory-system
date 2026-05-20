"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Printer,
  Clock,
  Package,
  DollarSign,
  Zap,
  CheckCircle2,
  Download,
  History,
} from "lucide-react";
import { trpc } from "@/client/trpc";
import Loading from "@/components/misc/loading";
import ErrorPage from "@/pages/Error";
import { StatCard } from "@/components/print-stats/StatCard";
import { FilamentUsageChart } from "@/components/print-stats/FilamentUsageChart";
import { FilamentLeaderboard } from "@/components/print-stats/FilamentLeaderboard";
import { PrintsByPrinterChart } from "@/components/print-stats/PrintsByPrinterChart";
import { SuccessRateChart } from "@/components/print-stats/SuccessRateChart";
import { FilamentByProject } from "@/components/print-stats/FilamentByProject";
import { FilamentByPerson } from "@/components/print-stats/FilamentByPerson";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DatePreset = "7d" | "30d" | "90d" | "365d" | "all";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 3 months" },
  { value: "365d", label: "Last year" },
  { value: "all", label: "All time" },
];

function presetToDateFrom(preset: DatePreset): string | undefined {
  if (preset === "all") return undefined;
  const days = parseInt(preset);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)}kg`;
  return `${Math.round(g)}g`;
}

export default function PrintStats() {
  const [preset, setPreset] = useState<DatePreset>("30d");
  const navigate = useNavigate();

  const dateFrom = presetToDateFrom(preset);

  const {
    data: overview,
    isLoading,
    error,
  } = trpc.printStats.overview.useQuery({ dateFrom });

  const { data: recentLog } = trpc.printStats.printLog.useQuery({
    page: 0,
    pageSize: 10,
  });

  const { data: exportAvailable } = trpc.printStats.exportAvailable.useQuery();
  const { data: printers } = trpc.printStats.printers.useQuery();

  function handleExport() {
    const days = preset === "all" ? 3650 : parseInt(preset);
    window.open(`/api/bambu-stats-export?format=csv&days=${days}`, "_blank");
  }

  if (error) return <ErrorPage />;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Print Statistics</h1>
          <p className="text-sm text-muted-foreground">
            Filament usage, print history, and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={preset}
            onValueChange={(v) => setPreset(v as DatePreset)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {exportAvailable && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigate("/print-history")}
          >
            <History className="h-4 w-4 mr-1" />
            Full History
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Total Prints"
            value={overview.total_prints}
            icon={Printer}
            iconColor="text-blue-500"
          />
          <StatCard
            title="Success Rate"
            value={
              overview.total_prints > 0
                ? `${Math.round((overview.successful_prints / overview.total_prints) * 100)}%`
                : "—"
            }
            subtitle={`${overview.successful_prints} successful`}
            icon={CheckCircle2}
            iconColor="text-green-500"
          />
          <StatCard
            title="Print Time"
            value={formatHours(overview.total_print_time_hours)}
            icon={Clock}
            iconColor="text-purple-500"
          />
          <StatCard
            title="Filament Used"
            value={formatGrams(overview.total_filament_grams)}
            icon={Package}
            iconColor="text-orange-500"
          />
          <StatCard
            title="Total Cost"
            value={
              overview.total_cost > 0
                ? `$${overview.total_cost.toFixed(2)}`
                : "—"
            }
            icon={DollarSign}
            iconColor="text-yellow-500"
          />
          <StatCard
            title="Energy"
            value={
              overview.total_energy_kwh > 0
                ? `${overview.total_energy_kwh.toFixed(2)} kWh`
                : "—"
            }
            subtitle={
              overview.energy_data_warming_up ? "Warming up…" : undefined
            }
            icon={Zap}
            iconColor="text-cyan-500"
          />
        </div>
      ) : null}

      {/* Filament Usage Chart — full width */}
      <FilamentUsageChart />

      {/* Leaderboard + Printer Chart row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FilamentLeaderboard />
        {overview ? (
          <PrintsByPrinterChart
            data={overview.prints_by_printer}
            printerNames={Object.fromEntries(
              (printers ?? []).map((p) => [String(p.id), p.name]),
            )}
          />
        ) : (
          <div className="h-64 rounded-lg bg-muted animate-pulse" />
        )}
      </div>

      {/* Filament by project + by person row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FilamentByProject />
        <FilamentByPerson />
      </div>

      {/* Success Rate + Recent Prints row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {overview ? (
          <SuccessRateChart
            successful={overview.successful_prints}
            failed={overview.failed_prints}
            total={overview.total_prints}
          />
        ) : (
          <div className="h-48 rounded-lg bg-muted animate-pulse" />
        )}

        {/* Recent prints mini-table */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Recent Prints</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => void navigate("/print-history")}
              >
                View all →
              </Button>
            </div>
            <div className="divide-y">
              {!recentLog ? (
                <div className="flex h-40 items-center justify-center">
                  <Loading />
                </div>
              ) : recentLog.items.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                  No recent prints
                </div>
              ) : (
                recentLog.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    {entry.logEntryId != null && (
                      <img
                        src={`/api/bambu-thumbnail/${entry.logEntryId}`}
                        alt=""
                        className="h-8 w-8 rounded object-cover flex-shrink-0 bg-muted"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.printName ?? "Unnamed print"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.printerName ?? "Unknown printer"}
                        {entry.createdByUsername
                          ? ` · ${entry.createdByUsername}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          entry.status === "completed" &&
                            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                          entry.status === "failed" &&
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          entry.status === "cancelled" &&
                            "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                        )}
                      >
                        {entry.status}
                      </Badge>
                      {entry.filamentUsedGrams != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatGrams(entry.filamentUsedGrams)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
