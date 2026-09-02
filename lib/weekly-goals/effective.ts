import { sql, type SQL } from "drizzle-orm";
import { weeklyGoals } from "@/db/schema";

/**
 * Effective-% helpers for the Weekly Goals redesign.
 *
 * A goal's **effective %** is the manager-accepted % once a goal is reviewed
 * (`accept_pct IS NOT NULL`), otherwise the doer's own `pct_done`. The
 * **weekly score** for an employee/week is the weight-aware average of those
 * effective %s over the non-archived goals:
 *
 *     weeklyScore = Σ(effective% × weight) / Σ(weight)
 *
 * Both a SQL fragment (for aggregate queries) and a pure TS function (for the
 * UI / per-row display) are exported so the two layers stay in lock-step. No
 * DB or I/O — safe to import anywhere.
 */

/** Per-goal effective % as a SQL expression: COALESCE(accept_pct, pct_done). */
export const effectivePctSql: SQL<number> = sql<number>`coalesce(${weeklyGoals.acceptPct}, ${weeklyGoals.pctDone})`;

/**
 * Weight-aware weekly score as a SQL aggregate expression, rounded to an int in
 * [0,100]. Returns 0 when the weight total is 0 (no goals in the group). Pair
 * with a `WHERE archived = false` predicate at the call site so archived goals
 * never contribute.
 */
export const weeklyScoreSql: SQL<number> = sql<number>`coalesce(round(
  sum(${effectivePctSql} * ${weeklyGoals.weight})::numeric
  / nullif(sum(${weeklyGoals.weight}), 0)
)::int, 0)`;

/** A goal "completed" by the official metric = effective % ≥ 100. */
export const effectiveCompletedSql: SQL<number> = sql<number>`count(*) filter (where ${effectivePctSql} >= 100)::int`;

/** Pure TS per-goal effective %: acceptPct if reviewed, else pctDone. */
export function effectivePct(goal: {
  acceptPct: number | null;
  pctDone: number;
}): number {
  return goal.acceptPct ?? goal.pctDone;
}

/**
 * Pure TS weighted weekly score over a set of goals: Σ(eff×weight)/Σ(weight),
 * rounded to an int in [0,100]. Callers should pass only non-archived goals.
 * Returns 0 when the total weight is 0.
 */
export function weeklyScore(
  goals: { acceptPct: number | null; pctDone: number; weight: number }[],
): number {
  let weighted = 0;
  let total = 0;
  for (const g of goals) {
    weighted += effectivePct(g) * g.weight;
    total += g.weight;
  }
  if (total === 0) return 0;
  return Math.round(weighted / total);
}

/**
 * A person's weekly weight budget. Every active (non-archived) goal carries a
 * WEIGHT = its share of the week, and the per-person total must land on exactly
 * 100. The Add-goal form enforces this on creation; inline edits + imports could
 * historically push the total past 100 (e.g. 7 goals × 20 = 140), which is the
 * "weight is wrong / over 100" bug. `balanceWeightsToBudget` is the one-tap fix.
 */
export const WEIGHT_BUDGET = 100;

/** Sum of weights over a set of goals (clamps negatives to 0). */
export function weightTotal(goals: { weight: number }[]): number {
  return goals.reduce((s, g) => s + Math.max(0, g.weight), 0);
}

/**
 * Proportionally rescale a set of goal weights so they sum to EXACTLY `budget`
 * (default 100), as positive integers. Uses the largest-remainder method so the
 * rounded parts always add back up to the budget — never 99 or 101. Proportions
 * are preserved (7×20 → 7×14 with one goal nudged to 16 to hit 100). When every
 * weight is 0/equal it falls back to an even split. Pure: returns id → newWeight.
 */
export function balanceWeightsToBudget(
  goals: { id: string; weight: number }[],
  budget: number = WEIGHT_BUDGET,
): Map<string, number> {
  const out = new Map<string, number>();
  const n = goals.length;
  if (n === 0) return out;

  const total = weightTotal(goals);

  // No signal to scale by → distribute the budget as evenly as possible.
  if (total <= 0) {
    const base = Math.floor(budget / n);
    let rem = budget - base * n;
    for (const g of goals) out.set(g.id, base + (rem-- > 0 ? 1 : 0));
    return out;
  }

  // Exact proportional share, split into integer floor + fractional remainder.
  const parts = goals.map((g) => {
    const exact = (Math.max(0, g.weight) / total) * budget;
    const base = Math.floor(exact);
    return { id: g.id, base, frac: exact - base };
  });
  let assigned = parts.reduce((s, p) => s + p.base, 0);
  let leftover = budget - assigned; // 0..n-1 units still to hand out

  // Largest fractional remainders get the leftover units first.
  const order = [...parts].sort((a, b) => b.frac - a.frac);
  for (const p of parts) out.set(p.id, p.base);
  for (const p of order) {
    if (leftover <= 0) break;
    out.set(p.id, (out.get(p.id) ?? 0) + 1);
    leftover--;
  }
  return out;
}
