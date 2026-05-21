"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: { range: string; count: number }[];
}

export function ScoreDistribution({ data }: Props) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="range"
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--primary)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
