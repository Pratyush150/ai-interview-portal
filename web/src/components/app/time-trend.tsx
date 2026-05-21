"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: { week: string; days: number }[];
}

export function TimeTrend({ data }: Props) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="week"
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
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v}d`, "Time-to-hire"]}
          />
          <Line
            type="monotone"
            dataKey="days"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--primary)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
