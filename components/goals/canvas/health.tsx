"use client";

/**
 * Goals Canvas — SHARED HEALTH + VIZ ATOMS.
 *
 * Pure, client-only derivations + two tiny presentation atoms that every other
 * canvas unit (KPI strip, goal rows, peek panel) imports. STRICTLY zero
 * queries: health is computed from the DTO fields the page already passes
 * (effectiveGoalPct vs the linear pace-to-date of the goal's period, plus the
 * `clonedFromId` spillover flag). No new data, no DB columns.
 *
 * Brand laws (blueprint §0.3 / §8): the canvas identity is the goals amber
 * (Altus brand red #E10600/#A80400 — all in-module chrome is red). The only
 * red here is the semantic at-risk/spillover red #b91c1c already used by
 * `pctTone` / `originStyle`. All motion is spring-based via motion/react and
 * fully reduced-motion-gated. All numerals render `tabular-nums`.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  effectiveGoalPct,
  fmtNum,
  isSpillover,
  pctTone,
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { SPRING } from "./tokens";
import { clamp100, deriveHealth as canonicalHealth } from "@/lib/goals/derive";

/* ------------------------------------------------------------------ */
/* Semantic hexes (blueprint §8.1 — the ONLY colors this file may use) */
/* ------------------------------------------------------------------ */

const GREEN = "#15803d";
const RED = "#b91c1c";

/* House FLIP/entrance spring comes from the design contract (tokens.ts §2.0). */

/* ------------------------------------------------------------------ */
/* deriveHealth                                                        */
/* ------------------------------------------------------------------ */

/** The DTO slice health needs — every canvas goal shape satisfies this. */
export type HealthInput = Pick<GoalDTO, "periodKey" | "pctDone" | "acceptPct" | "clonedFromId">;

export interface CanvasHealth {
  /** Traffic band: green = done/ahead-of-pace · amber = on track · red = at risk/spillover. */
  band: "green" | "amber" | "red";
  /**
   * 0–100 heuristic likelihood of finishing the period at 100%, derived purely
   * from pace math (NO stored column — migration-0141 `confidence` is Phase
   * 1.5): done → 100; otherwise clamp(100 + delta) with a fixed −25 spillover
   * penalty (the spec's single 25-pt cut, reused — no invented thresholds).
   */
  confidence: number;
  /** True for the "needs attention" set: pace delta ≤ −25, or spillover. */
  atRisk: boolean;
  /** Ready-to-render pill text: Done · Ahead of pace · On track · At risk · Spillover. */
  label: string;
  /** effectiveGoalPct (acceptPct ?? pctDone), 0..100. */
  effective: number;
  /** Linear pace-to-date expectation for the goal's period, 0..100. */
  expected: number;
  /** effective − expected (negative = behind pace). */
  delta: number;
  /** Pill ink + wash — semantic hexes only (blueprint §8.1). */
  color: string;
  bg: string;
}

/**
 * Client-derived goal health (blueprint §5 — the Viva pace rule, fixed 25-pt
 * cut). A thin traffic-light adapter over the CANONICAL `deriveHealth` in
 * `lib/goals/derive.ts` (the math lives there and ONLY there — design §3.1).
 * Deterministic: pass `now` in (the workspace stamps it once per render) so
 * SSR and client render identically.
 */
export function deriveHealth(goal: HealthInput, now: Date): CanvasHealth {
  const h = canonicalHealth(effectiveGoalPct(goal), goal.periodKey, now, {
    spillover: isSpillover(goal),
  });
  return {
    band: h.band === "done" || h.band === "ahead" ? "green" : h.band === "on-track" ? "amber" : "red",
    confidence: h.confidence,
    atRisk: h.atRisk,
    label: h.label,
    effective: h.effective,
    expected: h.expected,
    delta: h.delta,
    color: h.color,
    bg: h.bg,
  };
}

/* ------------------------------------------------------------------ */
/* <ProgressDelta/> — animated brand bar + ▲/▼ delta vs last period    */
/* ------------------------------------------------------------------ */

export interface ProgressDeltaProps {
  /** Current effective %, 0..100. */
  pct: number;
  /** Prior period's effective %, or null when there is no prior period. */
  lastPct: number | null;
  className?: string;
}

/**
 * A compact progress atom: big tabular % + spring-animated tone bar + a
 * colourblind-safe ▲/▼ "vs last period" delta chip. Reduced motion ⇒ the bar
 * renders at its final width with no animation.
 */
export function ProgressDelta({ pct, lastPct, className }: ProgressDeltaProps) {
  const reduce = useReducedMotion();
  const safePct = clamp100(pct);
  const tone = pctTone(safePct);
  const delta = lastPct == null ? null : Math.round(safePct - clamp100(lastPct));

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[15px] font-black tabular-nums"
          style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
        >
          {safePct}%
        </span>
        {delta == null ? (
          <span className="text-[11px] font-semibold text-ink-subtle">— no prior period</span>
        ) : delta === 0 ? (
          <span className="text-[11px] font-bold tabular-nums text-ink-subtle">＝ level vs last period</span>
        ) : (
          <span
            className="text-[11px] font-black tabular-nums"
            style={{ color: delta > 0 ? GREEN : RED }}
          >
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last period
          </span>
        )}
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in srgb, ${GOALS_ACCENT} 10%, transparent)` }}
        role="progressbar"
        aria-valuenow={safePct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${tone.color}, color-mix(in srgb, ${tone.color} 72%, ${GOALS_ACCENT_DEEP}))`,
          }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${safePct}%` }}
          transition={reduce ? { duration: 0 } : SPRING}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* <TargetVsActual/> — two stacked labelled bars, brand tokens         */
/* ------------------------------------------------------------------ */

export interface TargetVsActualProps {
  /** Target quantity/amount (already parsed via `num()`), or null when unset. */
  target: number | null;
  /** Actual quantity/amount, or null when unset. */
  actual: number | null;
  /** Unit of measure suffix (e.g. "units", "₹"), or null for a bare number. */
  uom?: string | null;
  className?: string;
}

/**
 * Target vs actual as two stacked labelled bars scaled to the larger value.
 * The target bar is a soft amber reference wash; the actual bar takes its tone
 * from attainment (`pctTone(actual/target)`). Springs are reduced-motion-gated.
 */
export function TargetVsActual({ target, actual, uom, className }: TargetVsActualProps) {
  const reduce = useReducedMotion();
  const t = target != null && Number.isFinite(target) ? Math.max(0, target) : null;
  const a = actual != null && Number.isFinite(actual) ? Math.max(0, actual) : null;
  const max = Math.max(t ?? 0, a ?? 0);

  if (max <= 0) {
    return (
      <div className={className}>
        <span className="text-[12px] font-semibold text-ink-subtle">— no target set</span>
      </div>
    );
  }

  const attainPct = t != null && t > 0 ? Math.round(((a ?? 0) / t) * 100) : null;
  const actualTone = pctTone(attainPct ?? 100);
  const suffix = uom ? ` ${uom}` : "";

  const rows: Array<{ key: string; label: string; value: number | null; fill: string; ink: string }> = [
    {
      key: "target",
      label: "Target",
      value: t,
      fill: `color-mix(in srgb, ${GOALS_ACCENT} 26%, transparent)`,
      ink: "var(--color-ink-subtle, #64748b)",
    },
    {
      key: "actual",
      label: "Actual",
      value: a,
      fill: `linear-gradient(90deg, ${actualTone.color}, color-mix(in srgb, ${actualTone.color} 72%, ${GOALS_ACCENT_DEEP}))`,
      ink: actualTone.color,
    },
  ];

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const widthPct = Math.round(((row.value ?? 0) / max) * 100);
          return (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-subtle">
                  {row.label}
                </span>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: row.ink }}>
                  {row.value == null ? "—" : `${fmtNum(row.value)}${suffix}`}
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full"
                style={{ background: `color-mix(in srgb, ${GOALS_ACCENT} 8%, transparent)` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: row.fill }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={reduce ? { duration: 0 } : { ...SPRING, delay: reduce ? 0 : i * 0.06 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {attainPct != null ? (
        <div className="mt-1.5 text-right text-[11px] font-black tabular-nums" style={{ color: actualTone.color }}>
          {attainPct}% of target
        </div>
      ) : null}
    </div>
  );
}
