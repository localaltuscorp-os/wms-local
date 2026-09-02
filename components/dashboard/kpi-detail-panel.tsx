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

/** A crisp area-sparkline (line + soft gradient fill + leading dot). */
function Sparkline({ data, neon, neonDeep }: { data: number[]; neon: string; neonDeep: string }) {
  const id = React.useId();
  const W = 560;
  const H = 132;
  const PAD = 10;
  const series = data.length ? data : [0, 0];
  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);
  const range = max - min || 1;
  const pts = series.map((v, i) => {
    const x = PAD + (i / (series.length - 1 || 1)) * (W - 2 * PAD);
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const area = `${line} L${last[0].toFixed(1)},${H - PAD} L${pts[0]![0].toFixed(1)},${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 132 }}>
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgb(${neon})`} stopOpacity={0.3} />
          <stop offset="100%" stopColor={`rgb(${neon})`} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`rgb(${neonDeep})`}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={4.5} fill={`rgb(${neonDeep})`} />
    </svg>
  );
}

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
}: {
  label: string;
  sublabel: string;
  value: number;
  kpi: KpiWithDelta;
  summary: WmsSummary;
  neon: string;
  neonDeep: string;
}) {
  const delta = value - kpi.previous;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
  const up = delta > 0;
  const deltaTone = delta === 0 ? "var(--color-ink-subtle)" : up ? "var(--color-green-deep)" : "var(--color-red-deep)";

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
          >
            {arrow} {Math.abs(delta)} <span className="font-semibold opacity-70">vs last</span>
          </span>
        </div>
        <Sparkline data={kpi.sparkline} neon={neon} neonDeep={neonDeep} />
        <div className="mt-1.5 flex justify-between text-[11.5px] font-bold tracking-wide text-ink-subtle tabular-nums">
          <span>14d</span>
          <span>7d</span>
          <span>today</span>
        </div>
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
