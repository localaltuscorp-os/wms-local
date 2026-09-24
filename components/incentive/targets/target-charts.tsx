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
import { formatInr } from "@/lib/format";
import { attainmentTone, toneBase } from "@/components/incentive/ui/tone";
import type { ProductBucket } from "@/lib/queries/incentive-target-plans";

/**
 * The three target visualizations. All read the same per-product buckets; none
 * compute incentive arithmetic of their own. "Target Performance" is a grouped
 * target-vs-actual comparison (amounts, since actual is only ever amount-based);
 * "Target Mix" and "Achievement" are single-series horizontal bars.
 */

interface ChartRow {
  productName: string;
  targetQuantity: number;
  targetAmount: number;
  actualAmount: number;
  achievement: number | null;
}

function chartRows(buckets: ProductBucket[]): ChartRow[] {
  return buckets.map((b) => ({
    productName: b.productName,
    targetQuantity: b.targetQuantity,
    targetAmount: b.targetAmount,
    actualAmount: b.actualAmount,
    achievement: b.achievement,
  }));
}

const tooltipStyle = {
  background: "var(--color-surface-card)",
  border: "1px solid var(--color-hairline-strong)",
  borderRadius: 8,
  padding: "6px 10px",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  color: "var(--color-ink-strong)",
  boxShadow: "0 8px 20px -8px rgba(15,23,42,0.25)",
};

const axisTick = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fill: "var(--color-ink)",
} as const;

/** Target vs Actual, grouped horizontal bars, per product. */
export function TargetPerformanceChart({ buckets }: { buckets: ProductBucket[] }) {
  const data = chartRows(buckets);
  return (
    <div style={{ height: Math.max(220, data.length * 52 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 72, top: 8, bottom: 4 }} barGap={2}>
          <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="productName"
            width={120}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as ChartRow | undefined;
              if (!row) return null;
              return (
                <div style={tooltipStyle}>
                  <strong>{row.productName}</strong>
                  <div style={{ fontFamily: "var(--font-mono)" }}>Target {formatInr(row.targetAmount)}</div>
                  <div style={{ fontFamily: "var(--font-mono)" }}>Actual {formatInr(row.actualAmount)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="targetAmount" name="Target" fill="var(--color-chart-1)" radius={[3, 0, 0, 3]} animationDuration={600} />
          <Bar dataKey="actualAmount" name="Actual" fill="var(--color-altus-red)" radius={[3, 0, 0, 3]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Target distribution by the selected measure — single horizontal bars. */
export function TargetMixChart({
  buckets,
  measure,
}: {
  buckets: ProductBucket[];
  measure: "quantity" | "amount";
}) {
  const data = chartRows(buckets).map((r) => ({
    label: r.productName,
    value: measure === "amount" ? r.targetAmount : r.targetQuantity,
  }));
  const fmt = (v: number) => (measure === "amount" ? formatInr(v) : String(Math.round(v)));
  return (
    <div style={{ height: Math.max(220, data.length * 52 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 96, top: 8, bottom: 4 }}>
          <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as { label: string; value: number } | undefined;
              if (!row) return null;
              return (
                <div style={tooltipStyle}>
                  <strong>{row.label}</strong>
                  <div style={{ fontFamily: "var(--font-mono)" }}>{fmt(row.value)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 3, 3]} animationDuration={600}>
            {data.map((d) => (
              <Cell key={d.label} fill="var(--color-chart-1)" />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              content={(props) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const w = Number(props.width ?? 0);
                const h = Number(props.height ?? 0);
                const i = Number(props.index ?? 0);
                const row = data[i];
                if (!row) return null;
                return (
                  <text
                    x={x + w + 6}
                    y={y + h / 2}
                    dy={4}
                    fontFamily="var(--font-mono)"
                    fontSize={11}
                    fill="var(--color-graphite)"
                  >
                    {fmt(row.value)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Achievement percentage per product — not capped at 100. */
export function TargetAchievementChart({ buckets }: { buckets: ProductBucket[] }) {
  const data = chartRows(buckets).map((r) => ({
    label: r.productName,
    value: r.achievement == null ? 0 : Math.round(r.achievement),
    color: toneBase(attainmentTone(r.achievement)),
    pct: r.achievement,
  }));
  return (
    <div style={{ height: Math.max(220, data.length * 52 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 56, top: 8, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, "auto"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-soft)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as { label: string; pct: number | null } | undefined;
              if (!row) return null;
              return (
                <div style={tooltipStyle}>
                  <strong>{row.label}</strong>
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    {row.pct == null ? "—" : `${row.pct.toFixed(0)}%`}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 3, 3]} animationDuration={600}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              content={(props) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const w = Number(props.width ?? 0);
                const h = Number(props.height ?? 0);
                const i = Number(props.index ?? 0);
                const row = data[i];
                if (!row) return null;
                return (
                  <text
                    x={x + w + 6}
                    y={y + h / 2}
                    dy={4}
                    fontFamily="var(--font-mono)"
                    fontSize={11}
                    fill="var(--color-graphite)"
                  >
                    {row.pct == null ? "—" : `${row.pct.toFixed(0)}%`}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
