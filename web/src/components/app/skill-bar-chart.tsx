"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

interface Props {
  data: { dimension: string; score: number }[];
}

export function SkillBarChart({ data }: Props) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <XAxis
            type="number"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="dimension"
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              padding: "6px 10px",
            }}
            formatter={(v: number) => [v.toFixed(1), "Score"]}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={22}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.score >= 8
                    ? "var(--success)"
                    : d.score >= 6
                      ? "var(--primary)"
                      : d.score >= 4
                        ? "var(--warning)"
                        : "var(--danger)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
