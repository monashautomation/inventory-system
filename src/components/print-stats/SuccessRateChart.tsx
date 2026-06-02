"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SuccessRateChartProps {
  successful: number;
  failed: number;
  total: number;
}

const COLORS = {
  successful: "#10b981", // emerald-500
  failed: "#ef4444", // red-500
  other: "#6b7280", // gray-500
};

export function SuccessRateChart({
  successful,
  failed,
  total,
}: SuccessRateChartProps) {
  const other = Math.max(0, total - successful - failed);
  const rate = total > 0 ? Math.round((successful / total) * 100) : 0;

  const chartData = [
    { name: "Successful", value: successful, color: COLORS.successful },
    { name: "Failed", value: failed, color: COLORS.failed },
    ...(other > 0
      ? [{ name: "Other", value: other, color: COLORS.other }]
      : []),
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Success Rate</CardTitle>
          <CardDescription>Print outcome breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
            No print data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Success Rate</CardTitle>
        <CardDescription>Print outcome breakdown</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(v: number) => [v, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold">{rate}%</span>
            <span className="text-xs text-muted-foreground">success</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {chartData.map((entry) => (
            <li key={entry.name} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ background: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-4 font-medium">{entry.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
