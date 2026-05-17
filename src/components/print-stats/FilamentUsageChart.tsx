"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/client/trpc";
import Loading from "@/components/misc/loading";
import { useState } from "react";
import { CHART_PALETTE } from "./chartColors";

type DayOption = 7 | 30 | 90 | 365;

const DAY_OPTIONS: { value: DayOption; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 3 months" },
  { value: 365, label: "Last year" },
];

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const date = label
    ? new Date(label).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-md text-popover-foreground text-xs">
      <p className="font-medium mb-1">{date}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium">{entry.value.toFixed(1)}g</span>
        </div>
      ))}
    </div>
  );
}

export function FilamentUsageChart() {
  const [days, setDays] = useState<DayOption>(30);

  const { data, isLoading } = trpc.printStats.filamentTimeSeries.useQuery({
    days,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Filament Usage Over Time</CardTitle>
          <CardDescription>Grams used per day by filament type</CardDescription>
        </div>
        <Select
          value={String(days)}
          onValueChange={(v) => setDays(Number(v) as DayOption)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex h-[280px] items-center justify-center">
            <Loading />
          </div>
        ) : !data || data.types.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
            No filament usage data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={data.rows}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                {data.types.map((type, i) => (
                  <linearGradient
                    key={type}
                    id={`grad-fu-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={CHART_PALETTE[i % CHART_PALETTE.length]}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor={CHART_PALETTE[i % CHART_PALETTE.length]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(128,128,128,0.15)"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={days <= 7 ? 0 : days <= 30 ? 4 : 16}
                tick={{ fontSize: 11, fill: "currentColor" }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "currentColor" }}
                tickFormatter={(v: number) => `${v}g`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span style={{ fontSize: 12 }}>{value}</span>
                )}
              />
              {data.types.map((type, i) => (
                <Area
                  key={type}
                  dataKey={type}
                  type="monotone"
                  fill={`url(#grad-fu-${i})`}
                  stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
