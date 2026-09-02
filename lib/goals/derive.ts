/**
 * Goals — the SINGLE canonical derive layer (design doc
 * docs/superpowers/specs/2026-07-19-goals-redesign-DESIGN.md §3.1).
 *
 * Before this file existed the pace/health math was duplicated FIVE times
 * (health.tsx, zoom-canvas.tsx, kpi-strip.tsx, peek-panel.tsx, smart-toolbar.tsx)
 * and the rollup TWICE (weighted in zoom-canvas, plain-average in
 * cascade-workspace) — with divergent numbers. Every view now imports ONLY this
 * module; the old copies are deleted.
 *
 * PURE + ISOMORPHIC — no `server-only`, no DB, no React. Client and server may
 * both import it; the cascade dividers are shared with the server engine via
 * `./cascade-math` so optimistic and persisted numbers round identically.
 *
 * LOCKED DECISIONS (design §7 → resolved as constraints; do NOT relitigate):
 *  (1) `rollupPct` / `rupeeRollup` are DERIVED PROJECTIONS for display only —
 *      always label them as such ("rollup 118% vs recorded 60%") and NEVER
 *      write them into goals.pctDone / goals.acceptPct / weekly_goals.pctDone:
 *      the punch gates, Sunday PDF and scoring read those columns directly.
 *  (2) weekly_goals.pctDone stays a MANUAL self-rating — never derive it from
 *      actual ÷ target.
 *  (3) weekly rows whose only target is free text (`targetDone`, no numeric
 *      targetQty/targetAmount) are "unmeasured": excluded from the numeric
 *      allocation/contribution math (see `isUnmeasured`).
 */

import { monthKeysOfQuarter, quarterOfKey } from "./types";
import { round2 } from "./cascade-math";
import { balanceWeightsToBudget } from "@/lib/weekly-goals/effective";

// Re-export the pure cascade dividers so canvas code has ONE math import.
export {
  divideYearToQuarter,
  divideQuarterToMonth,
  divideMonthToWeek,
  round2,
  parseNum,
  toMoney,
} from "./cascade-math";

/* ------------------------------------------------------------------ */
/* Numeric helpers                                                     */
/* ------------------------------------------------------------------ */

export const clamp100 = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/** numeric(14,2) columns arrive as strings client-side — normalise either shape. */
export function asNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* effective — acceptPct ?? pctDone (lock-step with                    */
/* lib/weekly-goals/effective.ts `effectivePct`)                       */
/* ------------------------------------------------------------------ */

/** Effective % = manager-accepted once reviewed, else the owner's self-rating. */
export function effective(n: { acceptPct: number | null; pctDone: number }): number {
  return n.acceptPct ?? n.pctDone;
}

/* ------------------------------------------------------------------ */
/* Period bounds + linear pace                                         */
/* ------------------------------------------------------------------ */

function monthStart(monthKey: string): Date {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
}
function monthEndExclusive(monthKey: string): Date {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 1);
}

/**
 * FY-calendar bounds of a period key, half-open [start, end):
 *   year    "2026"       → Apr 1 2026 .. Apr 1 2027
 *   quarter "2026-Q2"    → its 3 FY months (Jul 1 .. Oct 1)
 *   month   "2026-07"    → Jul 1 .. Aug 1
 *   week    "2026-07-13" → that Monday .. +7 days (weekly_goals.weekStart)
 */
export function periodBounds(periodKey: string): { start: Date; end: Date } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    const start = new Date(
      Number(periodKey.slice(0, 4)),
      Number(periodKey.slice(5, 7)) - 1,
      Number(periodKey.slice(8, 10)),
    );
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
  }
  if (/-Q[1-4]$/.test(periodKey)) {
    const fy = Number(periodKey.slice(0, 4));
    const months = monthKeysOfQuarter(fy, quarterOfKey(periodKey));
    const first = months[0] ?? `${fy}-04`;
    const last = months[months.length - 1] ?? `${fy}-06`;
    return { start: monthStart(first), end: monthEndExclusive(last) };
  }
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    return { start: monthStart(periodKey), end: monthEndExclusive(periodKey) };
  }
  const fy = Number(periodKey);
  return { start: new Date(fy, 3, 1), end: new Date(fy + 1, 3, 1) };
}

/** Linear elapsed-time expectation for a period, rounded + clamped 0..100. */
export function expectedPct(periodKey: string, now: Date): number {
  const { start, end } = periodBounds(periodKey);
  const span = end.getTime() - start.getTime();
  if (span <= 0) return now.getTime() >= start.getTime() ? 100 : 0;
  const frac = (now.getTime() - start.getTime()) / span;
  return Math.round(100 * Math.min(1, Math.max(0, frac)));
}

/* ------------------------------------------------------------------ */
/* deriveHealth — the Viva pace rule (fixed 25-pt cut)                 */
/* ------------------------------------------------------------------ */

export type HealthBand = "spillover" | "done" | "ahead" | "on-track" | "at-risk";

/** Semantic hexes (blueprint §8.1) — green / goals-amber / at-risk red. */
export const HEALTH_STYLE: Record<HealthBand, { color: string; bg: string; label: string }> = {
  done: { color: "#15803d", bg: "rgba(21,128,61,0.12)", label: "Done" },
  ahead: { color: "#15803d", bg: "rgba(21,128,61,0.12)", label: "Ahead of pace" },
  "on-track": { color: "#b45309", bg: "rgba(180,83,9,0.12)", label: "On track" },
  "at-risk": { color: "#b91c1c", bg: "rgba(185,28,28,0.10)", label: "At risk" },
  spillover: { color: "#b91c1c", bg: "rgba(185,28,28,0.10)", label: "Spillover" },
};

export interface DerivedHealth {
  band: HealthBand;
  /** Effective % (clamped 0..100). */
  effective: number;
  /** Linear pace-to-date expectation for the period, 0..100. */
  expected: number;
  /** effective − expected (negative = behind pace). */
  delta: number;
  /**
   * 0–100 heuristic likelihood of finishing the period at 100%, pure pace math
   * (no stored column): done → 100; otherwise clamp(100 + delta), with a fixed
   * −25pt penalty for spillover (the spec's single 25-pt Viva cut).
   */
  confidence: number;
  /** The "needs attention" set: at-risk (delta ≤ −25) or spillover. */
  atRisk: boolean;
  /** Ready-to-render pill text. */
  label: string;
  /** Pill ink + wash — semantic hexes only. */
  color: string;
  bg: string;
}

/**
 * Canonical health (consolidates the former 5 copies). Priority order:
 * spillover → done → ahead → on-track → at-risk. Deterministic — pass `now`
 * in (stamp it once per render) so SSR and client render identically.
 * `opts.spillover` = carried forward and still incomplete (`isSpillover(g)`).
 */
export function deriveHealth(
  effectivePct: number,
  periodKey: string,
  now: Date,
  opts?: { spillover?: boolean },
): DerivedHealth {
  const eff = clamp100(effectivePct);
  const expected = expectedPct(periodKey, now);
  const delta = eff - expected;
  const spillover = (opts?.spillover ?? false) && eff < 100;

  const band: HealthBand = spillover
    ? "spillover"
    : eff >= 100
      ? "done"
      : delta >= 0
        ? "ahead"
        : delta > -25
          ? "on-track"
          : "at-risk";

  const confidence =
    band === "done" ? 100 : band === "spillover" ? clamp100(100 + delta - 25) : clamp100(100 + delta);

  return {
    band,
    effective: eff,
    expected,
    delta,
    confidence,
    atRisk: band === "at-risk" || band === "spillover",
    ...HEALTH_STYLE[band],
  };
}

/* ------------------------------------------------------------------ */
/* rollupPct — WEIGHTED, adopted-only (kills the plain-avg divergence) */
/* ------------------------------------------------------------------ */

export interface RollupInput {
  pctDone: number;
  acceptPct: number | null;
  /** Per-row weight; ≤0 falls back to 100 (an even share). */
  weight: number;
  adopted: boolean;
}

/**
 * Weight-normalised attainment over the ADOPTED children:
 * Σ(effective × weight) / Σ(weight). Returns `null` when there are no adopted
 * children (callers typically fall back to the node's own effective %).
 *
 * ⚠ This is a DERIVED PROJECTION (locked decision 1) — display it as a labeled
 * rollup, never write it into pctDone/acceptPct.
 */
export function rollupPct(children: readonly RollupInput[]): number | null {
  let weightSum = 0;
  let acc = 0;
  for (const c of children) {
    if (!c.adopted) continue;
    const w = c.weight > 0 ? c.weight : 100;
    weightSum += w;
    acc += w * effective(c);
  }
  return weightSum > 0 ? Math.round(acc / weightSum) : null;
}

/* ------------------------------------------------------------------ */
/* rupeeRollup — first-level-with-amounts wins (no double count)       */
/* ------------------------------------------------------------------ */

export interface RupeeAmounts {
  targetAmount: string | number | null;
  actualAmount: string | number | null;
}

/**
 * ₹ rollup: the node's own amounts when present, else the recursive sum over
 * its children — the first level that carries amounts wins, so a cascaded
 * parent and its divided children are never both counted. `null` when no ₹
 * targets exist anywhere in the subtree.
 */
export function rupeeRollup<T extends RupeeAmounts>(
  node: T,
  childrenOf: (n: T) => readonly T[],
): { target: number; actual: number } | null {
  const own = asNum(node.targetAmount);
  if (own != null) return { target: own, actual: asNum(node.actualAmount) ?? 0 };
  let target = 0;
  let actual = 0;
  let found = false;
  for (const c of childrenOf(node)) {
    const r = rupeeRollup(c, childrenOf);
    if (r) {
      found = true;
      target += r.target;
      actual += r.actual;
    }
  }
  return found ? { target: round2(target), actual: round2(actual) } : null;
}

/* ------------------------------------------------------------------ */
/* Measured vs unmeasured (locked decision 3)                          */
/* ------------------------------------------------------------------ */

export interface MeasureInput {
  targetQty: string | number | null;
  targetAmount: string | number | null;
}

/** The numeric target of a node: qty first, else ₹ amount; null when neither. */
export function numericTarget(n: MeasureInput): number | null {
  const qty = asNum(n.targetQty);
  if (qty != null && qty > 0) return qty;
  const amt = asNum(n.targetAmount);
  return amt != null && amt > 0 ? amt : null;
}

/**
 * A row with no positive numeric target (e.g. a legacy weekly row whose only
 * target is the free-text `targetDone`) is UNMEASURED: render it as such and
 * exclude it from allocation / contribution math.
 */
export function isUnmeasured(n: MeasureInput): boolean {
  return numericTarget(n) == null;
}

/* ------------------------------------------------------------------ */
/* contributionPct — a child's share of the parent target              */
/* ------------------------------------------------------------------ */

export interface AllocationChild extends MeasureInput {
  id: string;
  adopted: boolean;
}

/**
 * Contribution % of one child (design §3.2; basis per locked decision Q3:
 * child ÷ PARENT target — the allocation chip surfaces any gap). Falls back to
 * child ÷ Σ(adopted measured siblings incl. the child) when the parent carries
 * no numeric target. Returns `null` for unmeasured children or when no basis
 * exists.
 */
export function contributionPct(
  child: AllocationChild,
  siblings: readonly AllocationChild[],
  parentTarget: number | null,
): number | null {
  const own = numericTarget(child);
  if (own == null) return null;
  if (parentTarget != null && parentTarget > 0) return Math.round((own / parentTarget) * 100);
  let sum = 0;
  for (const s of siblings) {
    if (!s.adopted) continue;
    sum += numericTarget(s) ?? 0;
  }
  // bug #19 — the denominator must count ADOPTION, not mere membership: a
  // crossed-out child is skipped by the loop above, so add its own target back
  // unless it was actually counted (present AND adopted) — otherwise a
  // crossed-out card reads 100% instead of its true share.
  if (!siblings.some((s) => s.adopted && s.id === child.id)) sum += own;
  return sum > 0 ? Math.round((own / sum) * 100) : null;
}

/* ------------------------------------------------------------------ */
/* allocation + suggestDistribution (largest-remainder)                */
/* ------------------------------------------------------------------ */

/** id → suggested new numeric target (2-dp), summing EXACTLY to the parent. */
export type Distribution = Map<string, number>;

/**
 * Largest-remainder redistribution of the parent target across the ADOPTED
 * MEASURED children, proportional to their current targets. REUSES
 * `balanceWeightsToBudget` (lib/weekly-goals/effective.ts) as the engine,
 * scaled to integer paise so the 2-dp parts always sum back to exactly
 * `round2(parentTarget)` — never off by a paisa. Empty map when there is
 * nothing to distribute.
 */
export function suggestDistribution(
  children: readonly AllocationChild[],
  parentTarget: number,
): Distribution {
  const out: Distribution = new Map();
  if (!(parentTarget > 0)) return out;
  const measured = children.filter((c) => c.adopted && !isUnmeasured(c));
  if (measured.length === 0) return out;

  const paise = balanceWeightsToBudget(
    measured.map((c) => ({ id: c.id, weight: numericTarget(c) ?? 0 })),
    Math.round(round2(parentTarget) * 100),
  );
  for (const [id, p] of paise) out.set(id, round2(p / 100));
  return out;
}

export interface Allocation {
  /** Σ numeric targets over adopted measured children (2-dp). */
  sum: number;
  /** sum − parentTarget (2-dp; positive = over-allocated). */
  delta: number;
  state: "exact" | "over" | "under";
  /** Ready-to-apply largest-remainder rebalance; null when already exact. */
  suggestion: Distribution | null;
}

/**
 * Over/under validation for a parent's children (design §3.2 — "Children total
 * 118% of the AQ2 target. Rebalance ▸"). Unmeasured children are excluded
 * (locked decision 3). Returns `null` when the parent has no numeric target or
 * no adopted measured children — nothing to validate.
 */
export function allocation(
  children: readonly AllocationChild[],
  parentTarget: number | null,
): Allocation | null {
  if (parentTarget == null || !(parentTarget > 0)) return null;
  const measured = children.filter((c) => c.adopted && !isUnmeasured(c));
  if (measured.length === 0) return null;

  const sum = round2(measured.reduce((s, c) => s + (numericTarget(c) ?? 0), 0));
  const delta = round2(sum - round2(parentTarget));
  const state: Allocation["state"] = Math.abs(delta) < 0.005 ? "exact" : delta > 0 ? "over" : "under";
  return {
    sum,
    delta,
    state,
    suggestion: state === "exact" ? null : suggestDistribution(children, parentTarget),
  };
}
