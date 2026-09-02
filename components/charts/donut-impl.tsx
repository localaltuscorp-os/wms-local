"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * A focused donut chart: one ring of slices coloured per `color`, with a
 * tooltip and an optional centred label/value. Callers render their own
 * legend (this component is intentionally just the ring).
 *
 * `stroke` is the line BETWEEN slices. It defaults to the card surface, which
 * reads as a gap rather than an outline — right for a chart whose palette is
 * already saturated. A caller whose slices include pale colours (the grade
 * distribution's pastel purple and sky blue) passes a real outline colour so
 * the wedges keep an edge against the card behind them.
 */
export function Donut({
  data,
  size = 200,
  centerLabel,
  centerValue,
  stroke = "var(--color-surface-card)",
  strokeWidth = 2,
}: {
  data: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const slices = data.filter((d) => d.value > 0);
  const outer = size / 2;
  const inner = Math.round(outer * 0.62);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            stroke={stroke}
            strokeWidth={strokeWidth}
            animationDuration={600}
          >
            {slices.map((s) => (
              <Cell key={s.label} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--color-hairline)",
              boxShadow: "0 4px 14px rgba(15,23,42,0.10)",
            }}
            formatter={(value, name) => [value as number, name as string]}
          />
        </PieChart>
      </ResponsiveContainer>

      {(centerLabel || centerValue) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          {centerValue && (
            <span
              className="tabular-nums font-black leading-none text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: Math.max(16, Math.round(size * 0.12)),
              }}
            >
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span
              className="mt-1 uppercase font-bold tracking-[0.08em] text-ink-subtle"
              style={{ fontSize: 11 }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
