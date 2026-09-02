"use client";

import * as React from "react";
import { CardGrid } from "@/components/layout/card-grid";
import { useAnimCount } from "@/components/dashboard/exec/viz/use-anim-count";

/**
 * Hero KPI tile — a big animated stat with an optional accent tone + suffix.
 * Brand display type, coloured top rail, subtle lift on hover. Pure/presentational.
 */
export interface HeroStat {
  key: string;
  label: string;
  /** Numeric value to count up to; null renders a dash. */
  value: number | null;
  /** e.g. "%", "/10", " h". */
  suffix?: string;
  sublabel?: string;
  /** Accent CSS colour (rail + number). Defaults to ink. */
  accent?: string;
  accentDeep?: string;
  /** Decimals for the count-up. */
  decimals?: number;
}

export function KpiHero({ stats }: { stats: HeroStat[] }) {
  return (
    <section aria-label="Hiring headline metrics">
      <CardGrid min={180} gap="1rem">
        {stats.map((s, i) => (
          <HeroTile key={s.key} stat={s} index={i} />
        ))}
      </CardGrid>
    </section>
  );
}

function HeroTile({ stat, index }: { stat: HeroStat; index: number }) {
  const accent = stat.accent ?? "var(--color-ink-strong)";
  const accentDeep = stat.accentDeep ?? accent;
  const animated = useAnimCount(stat.value ?? 0, 1100, stat.decimals ?? 0);
  const shown = stat.value == null ? "—" : stat.decimals ? animated.toFixed(stat.decimals) : Math.round(animated).toLocaleString();

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card p-5 max-md:p-4 transition-transform hover:-translate-y-0.5"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.05)", opacity: 0, animation: `fadeUp 500ms ease-out ${index * 70}ms forwards` }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, ${accentDeep})` }} />
      <div className="uppercase font-black tracking-[0.07em] leading-tight text-ink-soft" style={{ fontSize: 12, minHeight: 28 }}>
        {stat.label}
      </div>
      <div className="mt-2 flex items-baseline gap-0.5">
        <span
          className="tabular-nums leading-none"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3vw, 40px)", letterSpacing: "-0.03em", color: stat.value == null ? "var(--color-ink-muted)" : accentDeep }}
        >
          {shown}
        </span>
        {stat.value != null && stat.suffix && (
          <span className="font-black" style={{ fontSize: 18, color: accentDeep }}>{stat.suffix}</span>
        )}
      </div>
      {stat.sublabel && <div className="mt-1.5 text-[12px] font-semibold text-ink-muted">{stat.sublabel}</div>}
    </div>
  );
}
