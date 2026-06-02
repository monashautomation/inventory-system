"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CHART_PALETTE } from "./chartColors";

interface PrintsByPrinterChartProps {
  data: Record<string, unknown>;
  printerNames?: Record<string, string>;
}

interface PrinterDataPoint {
  name: string;
  count: number;
  grams: number;
}

export function PrintsByPrinterChart({
  data,
  printerNames = {},
}: PrintsByPrinterChartProps) {
  const chartData: PrinterDataPoint[] = Object.entries(data)
    .map(([key, val]) => {
      const name = printerNames[key] ?? key;
      if (typeof val === "number") return { name, count: val, grams: 0 };
      const v = val as {
        count?: number;
        prints?: number;
        grams?: number;
        total_grams?: number;
      };
      return {
        name,
        count: v.count ?? v.prints ?? 0,
        grams: v.grams ?? v.total_grams ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prints by Printer</CardTitle>
          <CardDescription>Print count per printer</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
            No printer data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prints by Printer</CardTitle>
        <CardDescription>Print count per printer</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              className="stroke-border"
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              tickFormatter={(v: string) =>
                v.length > 12 ? `${v.slice(0, 12)}…` : v
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              allowDecimals={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                value,
                name === "count" ? "Prints" : "Grams",
              ]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
