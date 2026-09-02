"use client";
import { Donut } from "@/components/charts/donut";
import { formatInr } from "@/lib/format";
import type { IncentiveNameRow } from "@/lib/queries/incentives";

// A small ordered palette of existing design tokens — one per incentive name.
const PALETTE = [
  "#16a34a",
  "var(--color-blue)",
  "var(--color-purple)",
  "var(--color-amber)",
  "#15803d",
  "var(--color-orange)",
  "var(--color-rose)",
];

/**
 * Donut of permanent-incentive approved totals by incentive name, with a
 * coloured legend listing each name + its ₹ total. Server passes the
 * pre-aggregated per-name rows.
 */
export function IncentiveNameChart({ rows }: { rows: IncentiveNameRow[] }) {
  const positive = rows.filter((r) => r.approved > 0);

  if (positive.length === 0) {
    return (
      <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
        No permanent incentives recorded this year.
      </p>
    );
  }

  const total = positive.reduce((s, r) => s + r.approved, 0);
  const slices = positive.map((r, i) => ({
    label: r.name,
    value: r.approved,
    color: PALETTE[i % PALETTE.length]!,
  }));

  return (
    <div className="mt-1 flex items-center gap-7 max-md:flex-col max-md:items-start max-md:gap-5">
      <div className="shrink-0">
        <Donut data={slices} size={200} centerLabel="Permanent" centerValue={compactInr(total)} />
      </div>
      <ul className="flex-1 min-w-0 space-y-2.5">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="flex items-center gap-3">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{ background: s.color }}
              />
              <span
                className="flex-1 min-w-0 truncate font-semibold text-ink-soft"
                style={{ fontSize: 14 }}
              >
                {s.label}
              </span>
              <span className="tabular-nums font-bold text-ink-strong" style={{ fontSize: 14 }}>
                {formatInr(s.value)}
              </span>
              <span
                className="tabular-nums font-semibold text-ink-subtle w-10 text-right"
                style={{ fontSize: 13 }}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function compactInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${n}`;
}
