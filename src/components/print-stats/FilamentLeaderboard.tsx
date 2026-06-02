"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/client/trpc";
import Loading from "@/components/misc/loading";
import { useState } from "react";
import { cn } from "@/lib/utils";

type DaysOption = 7 | 30 | 90 | 365 | 0;

const OPTIONS: { value: DaysOption; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
  { value: 0, label: "All" },
];

const BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

export function FilamentLeaderboard() {
  const [days, setDays] = useState<DaysOption>(30);

  const { data, isLoading } = trpc.printStats.filamentLeaderboard.useQuery({
    days,
  });

  const maxGrams = data ? Math.max(...data.map((d) => d.totalGrams), 1) : 1;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Filament Leaderboard</CardTitle>
          <CardDescription>Most used filament types by weight</CardDescription>
        </div>
        <div className="flex gap-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                days === o.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loading />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
            No data for this period
          </div>
        ) : (
          <ol className="space-y-3">
            {data.slice(0, 8).map((entry, i) => {
              const isHex =
                entry.color != null && /^#?[0-9a-fA-F]{6}$/.test(entry.color);
              const hexColor = isHex
                ? entry.color!.startsWith("#")
                  ? entry.color!
                  : `#${entry.color!}`
                : null;
              const label = entry.color
                ? `${entry.type} ${entry.color}`
                : entry.type;
              return (
                <li
                  key={`${entry.type}||${entry.color ?? ""}`}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      {hexColor ? (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: hexColor }}
                        />
                      ) : null}
                      <span className="font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{entry.printCount} prints</span>
                      <span className="font-medium text-foreground">
                        {entry.totalGrams >= 1000
                          ? `${(entry.totalGrams / 1000).toFixed(2)}kg`
                          : `${Math.round(entry.totalGrams)}g`}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        !hexColor &&
                          (BAR_COLORS[i % BAR_COLORS.length] ?? "bg-primary"),
                      )}
                      style={{
                        width: `${(entry.totalGrams / maxGrams) * 100}%`,
                        ...(hexColor ? { backgroundColor: hexColor } : {}),
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
