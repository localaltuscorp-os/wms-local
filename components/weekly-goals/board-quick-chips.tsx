"use client";

import * as React from "react";
import { Flame, TrendingUp, CheckCircle2, CircleDashed, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** The completion buckets a chip maps onto (mirrors the board's `completion`). */
export type QuickChip = "all" | "behind" | "ontrack" | "done" | "unfilled";

interface ChipDef {
  key: QuickChip;
  label: string;
  icon: LucideIcon;
  /** Brand tone used for the active pill + the count bubble. */
  tint: string;
  deep: string;
}

const CHIPS: ChipDef[] = [
  { key: "all", label: "All", icon: LayoutGrid, tint: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" },
  { key: "behind", label: "Behind", icon: Flame, tint: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" },
  { key: "ontrack", label: "On track", icon: TrendingUp, tint: "var(--color-amber)", deep: "var(--color-amber-deep)" },
  { key: "done", label: "Done", icon: CheckCircle2, tint: "var(--color-green)", deep: "var(--color-green-deep)" },
  { key: "unfilled", label: "Unfilled", icon: CircleDashed, tint: "var(--color-ink-soft)", deep: "var(--color-ink-strong)" },
];

/**
 * The at-a-glance quick-filter chip rail for the Weekly Goals board. Each chip is
 * a real <button> that flips the board's completion bucket (single source of
 * truth stays in the board). "Unfilled" is an extra bucket the board resolves to
 * "goals whose % is still 0". Counts come pre-computed from the board so the rail
 * never re-derives the (heavy) filtered set.
 */
export function BoardQuickChips({
  value,
  counts,
  onSelect,
}: {
  value: QuickChip;
  counts: Record<QuickChip, number>;
  onSelect: (v: QuickChip) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Quick filters">
      {CHIPS.map((c) => {
        const active = value === c.key;
        const Icon = c.icon;
        const n = counts[c.key] ?? 0;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active && c.key !== "all" ? "all" : c.key)}
            className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-all wg-btn cursor-pointer ${FOCUS_RING}`}
            style={
              active
                ? {
                    background: `color-mix(in srgb, ${c.tint} 12%, var(--color-surface-card))`,
                    borderColor: `color-mix(in srgb, ${c.tint} 45%, transparent)`,
                    color: c.deep,
                    boxShadow: `0 1px 3px color-mix(in srgb, ${c.tint} 22%, transparent)`,
                  }
                : {
                    background: "var(--color-surface-card)",
                    borderColor: "var(--color-hairline)",
                    color: "var(--color-ink-soft)",
                  }
            }
          >
            <Icon size={14} strokeWidth={2.5} style={{ color: active ? c.tint : "var(--color-ink-subtle)" }} />
            {c.label}
            <span
              className="ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
              style={
                active
                  ? { background: c.tint, color: "#fff" }
                  : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }
              }
            >
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}
