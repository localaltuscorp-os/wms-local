"use client";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

export interface HBarRow {
  label: string;
  value: number;
  color?: string;
}

export function HBars({
  data,
  height = 320,
  defaultColor = "var(--color-chart-1)",
  highlightLast = false,
}: {
  data: HBarRow[];
  height?: number;
  defaultColor?: string;
  highlightLast?: boolean;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 24, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fill: "var(--color-ink)",
            }}
            tickLine={false}
            axisLine={false}
          />
          <Bar dataKey="value" animationDuration={600}>
            {data.map((row, i) => {
              const color =
                row.color ??
                (highlightLast && i === data.length - 1
                  ? "var(--color-altus-red)"
                  : defaultColor);
              return <Cell key={row.label} fill={color} />;
            })}
            <LabelList
              dataKey="value"
              position="right"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fill: "var(--color-graphite)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
