"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: { name: string; value: number }[];
}

export function FunnelChart({ data }: Props) {
  const colors = [
    "var(--chart-1)",
    "var(--chart-5)",
    "var(--chart-6)",
    "var(--chart-3)",
    "var(--chart-2)",
  ];
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <XAxis
            type="number"
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={100}
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
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
