/**
 * ALTUS GOALS — the PURE, deterministic goal-scoring core.
 *
 * PURE + CLIENT-SAFE: no server-only or db imports, no side effects. Mirrors the
 * concepts in lib/performance/scoring.ts (the appraisal engine) so the two stay
 * aligned, without duplicating that engine's role/bucket machinery.
 *
 * The three scoring streams (spec §3):
 *   1. KPI stream       → internalKpiPct()      — the incentive-authorization %.
 *   2. Non-KPI stream   → nonKpiWeightedScore() — the Monthly Goals dimension %.
 *   3. Essential stream → essentialDelayDays()  — tracked-only date delay.
 * Plus performanceBand() for the dashboard's semantic bands (spec §6).
 *
 * Spec: docs/superpowers/specs/2026-07-27-goals-module-design.md
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** One KPI line: raw actual vs target, plus its intra-KPI weight. */
export interface KpiScoreLine {
  actual: number;
  target: number;
  /** Intra-KPI weight (0..100); a person's lines are assumed to sum to 100. */
  weight: number;
}

/** One Non-KPI (branding/strategic/operational) goal: its approved % + weight. */
export interface NonKpiScoreGoal {
  /** Month-end super-admin-approved % (0..100). */
  approvedPct: number;
  /** Performance weight; the month's Non-KPI weights are meant to sum to 100. */
  weight: number;
}

/**
 * KPI stream (spec §3.1). Internal KPI % = Σ( min(actual÷target, 1) × weight ),
 * weights assumed Σ = 100. This % **is** the Final Incentive Authorization.
 * Guards target ≤ 0 (that line contributes 0). Result is clamped to 0..100.
 *
 * @example internalKpiPct([{actual: 8, target: 8, weight: 40}, {actual: 5, target: 10, weight: 60}])
 *   // line1 micro=1 ×40 = 40 ; line2 micro=0.5 ×60 = 30 ; → 70
 * @example internalKpiPct([]) // → 0
 * @example internalKpiPct([{actual: 100, target: 0, weight: 100}]) // → 0 (target guard)
 */
export function internalKpiPct(lines: KpiScoreLine[]): number {
  if (!lines || lines.length === 0) return 0;
  const total = lines.reduce((sum, l) => {
    const micro = l.target > 0 ? clamp(l.actual / l.target, 0, 1) : 0;
    return sum + micro * l.weight;
  }, 0);
  return round1(clamp(total, 0, 100));
}

/**
 * Non-KPI stream (spec §3.2). Weighted roll-up of Branding/Strategic/Operational
 * approved %s → the Monthly Goals dimension score. Σ(approvedPct × weight) ÷
 * Σ(weight), so it self-normalizes if the weights don't sum to exactly 100.
 * Returns 0 when there are no goals or the weights sum to 0. Clamped to 0..100.
 *
 * @example nonKpiWeightedScore([{approvedPct: 100, weight: 50}, {approvedPct: 60, weight: 50}])
 *   // (100×50 + 60×50) / 100 = 80
 * @example nonKpiWeightedScore([{approvedPct: 90, weight: 30}, {approvedPct: 60, weight: 10}])
 *   // weights sum 40 → (90×30 + 60×10) / 40 = 82.5 (normalized)
 * @example nonKpiWeightedScore([]) // → 0
 */
export function nonKpiWeightedScore(goals: NonKpiScoreGoal[]): number {
  if (!goals || goals.length === 0) return 0;
  const weightSum = goals.reduce((s, g) => s + g.weight, 0);
  if (weightSum <= 0) return 0;
  const weighted = goals.reduce(
    (s, g) => s + clamp(g.approvedPct, 0, 100) * g.weight,
    0,
  );
  return round1(clamp(weighted / weightSum, 0, 100));
}

/**
 * Essential stream (spec §3.3). Whole days actual − target (delay); ≥ 0 (early /
 * on-time delivery reports 0, never negative). Returns null when either date is
 * missing. Never scored — this feeds the "days delayed" dashboard column only.
 * Dates are ISO strings ('YYYY-MM-DD' or full timestamps).
 *
 * @example essentialDelayDays("2026-07-10", "2026-07-13") // → 3
 * @example essentialDelayDays("2026-07-10", "2026-07-08") // → 0 (early → clamped)
 * @example essentialDelayDays("2026-07-10", null)          // → null
 */
export function essentialDelayDays(
  targetDate: string | null,
  actualDate: string | null,
): number | null {
  if (!targetDate || !actualDate) return null;
  const t = new Date(targetDate).getTime();
  const a = new Date(actualDate).getTime();
  if (Number.isNaN(t) || Number.isNaN(a)) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = Math.round((a - t) / MS_PER_DAY);
  return Math.max(0, days);
}

/** Dashboard semantic band. */
export type PerformanceBand = "on_track" | "watch" | "behind";

/**
 * Semantic performance band (spec §6): ≥80 on_track · 60–79 watch · <60 behind.
 *
 * @example performanceBand(82.5) // → "on_track"
 * @example performanceBand(60)   // → "watch"
 * @example performanceBand(59.9) // → "behind"
 */
export function performanceBand(pct: number): PerformanceBand {
  if (pct >= 80) return "on_track";
  if (pct >= 60) return "watch";
  return "behind";
}
