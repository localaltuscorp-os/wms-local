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
import type { HBarRow } from "./h-bars-impl";

export type { HBarRow };

export function VBars({
  data,
  height = 320,
  defaultColor = "var(--color-chart-1)",
  /** Fixed axis domain max — pass 100 for a 0-100% scale. Auto-scales otherwise. */
  maxValue,
  /** Tooltip readout, e.g. `(row) => `${row.value}% · ${row.count}``. Falls
   *  back to the raw value when omitted. */
  rightLabel,
  /** Bar click — receives the clicked row and its index. Bars render with a
   *  pointer cursor when this is provided. */
  onBarClick,
}: {
  data: HBarRow[];
  height?: number;
  defaultColor?: string;
  maxValue?: number;
  rightLabel?: (row: HBarRow) => string;
  onBarClick?: (row: HBarRow, index: number) => void;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--color-hairline-strong)" }}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={54}
            tick={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-subtle)" }}
          />
          <YAxis
            domain={[0, maxValue ?? "auto"]}
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
            tick={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-subtle)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as HBarRow | undefined;
              if (!row) return null;
              return (
                <div
                  style={{
                    background: "var(--color-surface-card)",
                    border: "1px solid var(--color-hairline-strong)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    color: "var(--color-ink-strong)",
                    boxShadow: "0 8px 20px -8px rgba(15,23,42,0.25)",
                  }}
                >
                  <strong>{row.label}</strong>
                  <div style={{ fontFamily: "var(--font-mono)" }}>{rightLabel ? rightLabel(row) : row.value}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" animationDuration={600} radius={[4, 4, 0, 0]}>
            {data.map((row, i) => (
              <Cell
                key={row.label}
                fill={row.color ?? defaultColor}
                onClick={onBarClick ? () => onBarClick(row, i) : undefined}
                style={onBarClick ? { cursor: "pointer" } : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
