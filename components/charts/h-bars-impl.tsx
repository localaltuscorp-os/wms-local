"use client";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
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
  /** Domain max for the value axis — defaults to auto-scale. Pass 100 for a
   *  fixed 0-100% scale so bars stay comparable across re-renders/filters. */
  maxValue,
  /** Custom right-of-bar label, e.g. `(row) => `${row.value}% · ${row.count}``.
   *  Defaults to the raw numeric value (unchanged existing behavior). */
  rightLabel,
  /** Row click — receives the clicked row and its index. Bars render with a
   *  pointer cursor when this is provided. */
  onBarClick,
}: {
  data: HBarRow[];
  height?: number;
  defaultColor?: string;
  highlightLast?: boolean;
  maxValue?: number;
  rightLabel?: (row: HBarRow) => string;
  onBarClick?: (row: HBarRow, index: number) => void;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 48, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide domain={[0, maxValue ?? "auto"]} />
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
          <Bar dataKey="value" animationDuration={600} radius={[3, 3, 3, 3]}>
            {data.map((row, i) => {
              const color =
                row.color ??
                (highlightLast && i === data.length - 1
                  ? "var(--color-altus-red)"
                  : defaultColor);
              return (
                <Cell
                  key={row.label}
                  fill={color}
                  onClick={onBarClick ? () => onBarClick(row, i) : undefined}
                  style={onBarClick ? { cursor: "pointer" } : undefined}
                />
              );
            })}
            <LabelList
              dataKey="value"
              position="right"
              content={
                rightLabel
                  ? (props) => {
                      const x = Number(props.x ?? 0);
                      const y = Number(props.y ?? 0);
                      const width = Number(props.width ?? 0);
                      const height = Number(props.height ?? 0);
                      const index = Number(props.index ?? 0);
                      const row = data[index];
                      if (!row) return null;
                      return (
                        <text
                          x={x + width + 6}
                          y={y + height / 2}
                          dy={4}
                          fontFamily="var(--font-mono)"
                          fontSize={11}
                          fill="var(--color-graphite)"
                        >
                          {rightLabel(row)}
                        </text>
                      );
                    }
                  : undefined
              }
              style={
                rightLabel
                  ? undefined
                  : {
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fill: "var(--color-graphite)",
                    }
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
