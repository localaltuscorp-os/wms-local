"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr } from "@/lib/format";
import type { IncentiveMonthRow } from "@/lib/queries/incentives";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-01-01" → "Jan '26". Falls back to the raw string if unparseable. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return month;
  return `${MONTHS[mi]} '${y.slice(2)}`;
}

/** Compact ₹ axis tick: ₹1.2L / ₹3.4Cr / ₹45k. */
function compactInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${n}`;
}

/**
 * Grouped bar of permanent vs project incentive per month for the dashboard.
 * Server passes the (already-aggregated) monthly series; this client component
 * just themes + renders it.
 */
export function IncentiveMonthlyChart({ rows }: { rows: IncentiveMonthRow[] }) {
  const data = rows.map((r) => ({
    label: monthLabel(r.month),
    permanent: r.permanent,
    project: r.project,
  }));

  if (data.length === 0) {
    return (
      <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
        No incentive activity this year yet.
      </p>
    );
  }

  return (
    <div style={{ height: 300 }} className="mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--color-hairline)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-subtle)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-hairline)" }}
          />
          <YAxis
            tickFormatter={(v) => compactInr(Number(v))}
            tick={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--color-ink-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            contentStyle={{
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--color-hairline)",
              boxShadow: "0 4px 14px rgba(15,23,42,0.10)",
            }}
            formatter={(value, name) => [formatInr(Number(value)), name as string]}
          />
          <Legend
            wrapperStyle={{ fontFamily: "var(--font-sans)", fontSize: 12, paddingTop: 6 }}
          />
          <Bar
            dataKey="permanent"
            name="Permanent"
            fill="#16a34a"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
            animationDuration={600}
          />
          <Bar
            dataKey="project"
            name="Project"
            fill="var(--color-blue)"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
            animationDuration={600}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
