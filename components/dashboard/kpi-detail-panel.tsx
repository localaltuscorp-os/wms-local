"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  BadgeCheck,
  Hourglass,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { KpiWithDelta, WmsSummary } from "@/lib/types";
import { KpiTrendSparkline } from "./kpi-trend-sparkline";
import { formatTrendPct } from "./kpi-trend-badge";

interface ChipSpec {
  key: keyof WmsSummary;
  label: string;
  icon: LucideIcon;
  tone: string;
  suffix?: string;
}
const CHIPS: ChipSpec[] = [
  { key: "overdue", label: "Overdue", icon: AlertTriangle, tone: "red" },
  { key: "dueToday", label: "Due Today", icon: CalendarClock, tone: "amber" },
  { key: "dueThisWeek", label: "Due This Week", icon: CalendarDays, tone: "blue" },
  { key: "completionRate", label: "Completion", icon: CheckCircle2, tone: "green", suffix: "%" },
  { key: "approvalRate", label: "Approval", icon: BadgeCheck, tone: "purple", suffix: "%" },
  { key: "avgAgeDays", label: "Avg Age (open)", icon: Hourglass, tone: "slate", suffix: "d" },
  { key: "avgTimeToDoneDays", label: "Avg Time to Done", icon: Timer, tone: "orange", suffix: "d" },
];

export function KpiDetailPanel({
  label,
  sublabel,
  value,
  kpi,
  summary,
  neon,
  neonDeep,
  vsLabel = "vs last week",
}: {
  label: string;
  sublabel: string;
  /** The card's headline count. Rendered by the strip above, not here — this
   *  panel reports the WINDOW comparison, which is a different measure. */
  value: number;
  kpi: KpiWithDelta;
  summary: WmsSummary;
  neon: string;
  neonDeep: string;
  /** Same "vs last …" wording the card above shows, so the two agree. */
  vsLabel?: string;
}) {
  // The badge compares the LAST 7 DAYS with the 7 before it, and both numbers
  // come off the same series the chart draws. It used to be
  // `value - kpi.previous`, subtracting a 7-day count from a whole-range count
  // — two different windows, so the figure meant nothing.
  const trend = formatTrendPct(kpi);
  const deltaTone =
    trend.direction === "flat"
      ? "var(--color-ink-subtle)"
      : trend.direction === "up"
        ? "var(--color-green-deep)"
        : "var(--color-red-deep)";

  return (
    <div
      className="grid grid-cols-[1.25fr_1.55fr] gap-7 rounded-[22px] p-6 max-lg:grid-cols-1"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 30px -14px rgba(15,23,42,0.22)",
      }}
    >
      {/* Trend */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span
              className="uppercase font-black tracking-[0.08em]"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 13, color: `rgb(${neonDeep})` }}
            >
              {label}
            </span>
            <span className="text-ink-subtle font-semibold truncate" style={{ fontSize: 13 }}>
              {sublabel}
            </span>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 tabular-nums shrink-0"
            style={{ fontSize: 12.5, fontWeight: 800, color: deltaTone, background: "color-mix(in srgb, currentColor 12%, transparent)" }}
            title={trend.title}
          >
            {trend.arrow} {trend.text} <span className="font-semibold opacity-70">{vsLabel}</span>
          </span>
        </div>
        {/* `?? []` for the same stale-Data-Cache reason as formatTrendPct — the
            chart draws its own "no activity" state rather than throwing on a
            payload that predates the `trend` field. */}
        <KpiTrendSparkline points={kpi.trend ?? []} neon={neon} neonDeep={neonDeep} label={label} />
      </div>

      {/* Operational summary */}
      <div className="min-w-0">
        <p className="uppercase font-black tracking-[0.08em] text-ink-subtle mb-3" style={{ fontSize: 12 }}>
          Operational Summary
        </p>
        <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
          {CHIPS.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.key}
                className="rounded-xl px-3 py-3"
                style={{
                  background: "var(--color-surface-card)",
                  border: "1px solid var(--color-hairline)",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                }}
              >
                <span
                  className="inline-flex size-7 items-center justify-center rounded-lg mb-2"
                  style={{
                    background: `color-mix(in srgb, var(--color-${c.tone}) 14%, transparent)`,
                    color: `var(--color-${c.tone}-deep)`,
                  }}
                >
                  <Icon size={15} strokeWidth={2.4} />
                </span>
                <span
                  className="block tabular-nums leading-none text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 24 }}
                >
                  {summary[c.key]}
                  {c.suffix && <span className="text-ink-muted" style={{ fontSize: 15, fontWeight: 800 }}>{c.suffix}</span>}
                </span>
                <span className="block mt-1 font-bold text-ink-soft leading-tight" style={{ fontSize: 12 }}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
