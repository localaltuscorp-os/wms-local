"use client";

import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import type { Route } from "next";
import {
  FINE_BUCKET_STYLES,
  FINE_BUCKET_SLUGS,
  type FineBucketCount,
} from "@/lib/transforms/aging-buckets-fine";

/**
 * Delivery-performance distribution across the nine aging buckets, ordered most
 * overdue at the top down to earliest delivery at the bottom.
 *
 * Each row takes its own tier colour from `FINE_BUCKET_STYLES` — a nine-step
 * ramp (purple → dark red → red → orange → amber → neutral → sky → blue →
 * emerald) rather than the previous binary green/red. The binary scheme could
 * not distinguish one day late from three weeks late, which is the distinction
 * the chart exists to show.
 *
 * The legend names the two SIDES of the due date in words. It no longer carries
 * colour swatches: with nine tiers a two-swatch legend would be actively
 * misleading, and each row already states its own band in full.
 */
export function FineBucketBars({
  buckets,
  earlyLabel = "Before Due Date",
  lateLabel = "Overdue",
  heading,
  showLegend = true,
  scaleMax,
  linkStatuses,
  statusBreakdown,
  percentBase,
}: {
  buckets: FineBucketCount[];
  earlyLabel?: string;
  lateLabel?: string;
  /** Replaces the two-sided legend when this list is ONE side of a split. */
  heading?: string;
  showLegend?: boolean;
  /** Shared bar scale. When two lists sit side by side they must divide by the
   *  SAME denominator, or a 2-count bar on one side renders as long as a
   *  40-count bar on the other and the comparison the split exists for is a
   *  lie. Falls back to this list's own max when standalone. */
  scaleMax?: number;
  /** Statuses a click should carry into /tasks. Omit to leave rows inert —
   *  a row that navigates somewhere it cannot describe is worse than a row
   *  that does nothing. */
  linkStatuses?: string[];
  /** Status split shown in the tooltip. Every task in a given chart shares a
   *  status here (this panel is all sent-back work, the other is all done), so
   *  the caller states it once rather than the chart guessing per row. */
  statusBreakdown?: (count: number) => { label: string; value: number }[];
  /** Denominator for the tooltip percentage. Defaults to this list's own
   *  total; pass the full distribution's when the list is one half of a split. */
  percentBase?: number;
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  // Percentages are of the WHOLE distribution, not of the half a split shows,
  // so "64% of total" means the same thing on either side of a split.
  const pctBase = Math.max(percentBase ?? total, 1);
  const max = Math.max(scaleMax ?? 0, ...buckets.map((b) => b.count), 1);

  if (total === 0) {
    return (
      <p className="text-[13.5px] font-semibold text-ink-subtle">
        No dated tasks to place on the early/late scale yet.
      </p>
    );
  }

  return (
    <Tooltip.Provider delayDuration={120}>
    <div className="flex h-full flex-col">
      {heading ? (
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {heading}
        </div>
      ) : showLegend ? (
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          <span>{lateLabel}</span>
          <span aria-hidden className="text-gray-300">↓</span>
          <span>{earlyLabel}</span>
        </div>
      ) : null}

      {/* flex-1 + the rows' own flex-1 is what removes the dead white band at
          the bottom of the card: the list grows to whatever height the taller
          neighbouring panel sets, and the nine rows divide it evenly instead of
          stacking at their natural height and leaving the remainder empty. */}
      <ul className="flex flex-1 flex-col justify-between gap-2">
        {buckets.map((b) => {
          const style = FINE_BUCKET_STYLES[b.key];
          const w = (b.count / max) * 100;
          const empty = b.count === 0;
          const pct = Math.round((b.count / pctBase) * 100);
          const clickable = Boolean(linkStatuses) && b.count > 0;
          // Kept a plain string here and cast at the `href` below: a ternary with
          // a `Route` branch makes TS normalise the whole route union (TS2590).
          const href = clickable
            ? `/tasks?age_range=${FINE_BUCKET_SLUGS[b.key]}&status=${linkStatuses!.join(",")}`
            : null;
          const rowInner = (
            <>
              <span
                className="w-[34%] max-md:w-[42%] shrink-0 truncate text-[13px] font-bold text-gray-900"
              >
                {b.key}
              </span>
              <span
                /* h-4. The bars carry a nine-step colour ramp — purple-700
                   through emerald-600 — and at 14px the darkest steps read as
                   a hairline rather than as a band you can compare by eye. */
                className="relative h-4 flex-1 overflow-hidden rounded-full"
                style={{ background: "#F3F4F6" }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${w}%`,
                    background: style.color,
                    // The neutral tier is white on a near-white track, so it
                    // needs its own outline to be visible at all.
                    boxShadow: style.border ? `inset 0 0 0 1px ${style.border}` : undefined,
                  }}
                />
              </span>
              {/* Indicator pill — same tier colour as the bar, so the row reads
                  as one object rather than a bar and an unrelated number. */}
              <span
                className="inline-flex w-11 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[12.5px] font-black tabular-nums"
                style={{
                  background: empty ? "#F3F4F6" : style.color,
                  color: empty ? "#9CA3AF" : style.ink,
                  boxShadow: !empty && style.border ? `inset 0 0 0 1px ${style.border}` : undefined,
                }}
              >
                {b.count}
              </span>
            </>
          );

          // An empty bucket is not clickable: there is nothing on the other
          // side of the link, and a row that navigates to an empty table reads
          // as a broken filter rather than an honest zero.
          const row = href ? (
            <Link
              href={href as Route}
              className="flex flex-1 items-center gap-3 rounded-lg px-2 -mx-2 py-2 transition-colors hover:bg-slate-50"
            >
              {rowInner}
            </Link>
          ) : (
            <div
              className={`flex flex-1 items-center gap-3 rounded-lg px-2 -mx-2 py-2 ${
                b.count > 0 ? "transition-colors hover:bg-slate-50" : ""
              }`}
            >
              {rowInner}
            </div>
          );

          return (
            <li key={b.key} className="flex flex-1 items-stretch">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>{row}</Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="top"
                    align="center"
                    sideOffset={6}
                    collisionPadding={12}
                    className="z-[90] rounded-lg px-3 py-2 shadow-lg"
                    style={{ background: "#0F172A", color: "#fff", maxWidth: 260 }}
                  >
                    <p className="text-[12.5px] font-bold">{b.key}</p>
                    <p className="mt-0.5 text-[12px] font-semibold" style={{ opacity: 0.85 }}>
                      {b.count} {b.count === 1 ? "task" : "tasks"} ({pct}% of total)
                    </p>
                    {statusBreakdown && (
                      <p className="mt-1 text-[11.5px] font-medium" style={{ opacity: 0.7 }}>
                        {statusBreakdown(b.count)
                          .map((x) => `${x.label}: ${x.value}`)
                          .join("  |  ")}
                      </p>
                    )}
                    {clickable && (
                      <p className="mt-1 text-[11px] font-semibold" style={{ opacity: 0.6 }}>
                        Click to open these in Tasks
                      </p>
                    )}
                    <Tooltip.Arrow style={{ fill: "#0F172A" }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </li>
          );
        })}
      </ul>
    </div>
    </Tooltip.Provider>
  );
}
