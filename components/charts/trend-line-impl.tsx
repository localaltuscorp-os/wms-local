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

export interface TrendLinePoint {
  label: string;
  actual: number | null;
  expected: number;
}

export function TrendLine({
  data,
  height = 220,
  actualColor = "var(--color-altus-red)",
  expectedColor = "var(--color-ink-subtle)",
}: {
  data: TrendLinePoint[];
  height?: number;
  actualColor?: string;
  expectedColor?: string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: "var(--font-sans)", fontSize: 12, fill: "var(--color-ink-subtle)" }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            width={38}
            tick={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-subtle)" }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as TrendLinePoint | undefined;
              if (!point) return null;
              return (
                <div
                  style={{
                    background: "var(--color-surface-card)",
                    border: "1px solid var(--color-hairline-strong)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    color: "var(--color-ink-strong)",
                    boxShadow: "0 8px 20px -8px rgba(15,23,42,0.25)",
                  }}
                >
                  <strong>{label}</strong>
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    Actual: {point.actual != null ? `${point.actual}%` : "—"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-subtle)" }}>
                    Expected: {point.expected}%
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="expected"
            stroke={expectedColor}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke={actualColor}
            strokeWidth={2.5}
            dot={{ r: 4, fill: actualColor, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
