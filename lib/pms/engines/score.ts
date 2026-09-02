/**
 * PMS Layer 2 — the PURE Score engine (v2 model, mig 0096).
 *
 * computeScore() turns an employee's gathered signals into a 0–100 performance
 * score over the FIVE pillars from leadership's notes (docs/PMS_FULL_SPEC.md):
 *
 *   KPI 50          = Weekly-Goals achievement % + Incentive target-vs-actual %
 *   Skill-Upgrade 20 = Training attended + given (managers) + self-learning + Share
 *   Compliance 10   = DCC compliance % + Daily-Checklist completion %
 *   Attitude 10     = monthly manager review (attitude/behaviour/skill, 1..5)
 *   Team-Work 10    = peer + subordinate review (juniors/colleagues, 1..5)
 *
 * PURE function of its inputs and the config: EVERY weight, threshold and
 * coefficient comes from PmsScoreConfig — no literal appears here. Each pillar is
 * a weighted blend of its sub-signals; a sub-signal with no data is EXCLUDED from
 * that pillar's blend, and a pillar with no data is excluded from the overall
 * score (so a new hire isn't punished for empty pillars). Result ×100, clamped.
 */
import type { PmsScoreConfig } from "./config";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Weighted mean over the sub-signals that HAVE data (null = excluded). Returns
 *  null when no sub-signal has data or all weights are 0. */
function blend(parts: { rate: number | null; weight: number }[]): number | null {
  let sum = 0;
  let wt = 0;
  for (const p of parts) {
    if (p.rate === null || p.weight <= 0) continue;
    sum += p.rate * p.weight;
    wt += p.weight;
  }
  return wt > 0 ? sum / wt : null;
}

/** All signals the score reads, gathered by the read layer (twin + operational). */
export interface ScoreInput {
  // ── KPI ──
  weeklyGoalPct: number | null; // 0..100 weighted effective % (COALESCE(accept,pct))
  incentiveAttainmentPct: number | null; // 0..100 actual/target (null = no target set)
  // ── Skill-Upgrade (this period) ──
  isManager: boolean;
  trainGivenHours: number;
  trainAttendedHours: number;
  selfLearnHours: number;
  sharesDone: number;
  weeksInPeriod: number; // expected shares = one per week
  periodFraction: number; // 0..1 of the month elapsed (pro-rates monthly obligations)
  // ── Compliance ──
  dccDueCount: number;
  dccDoneCount: number;
  checklistDueCount: number;
  checklistDoneCount: number;
  // ── Attitude (manager monthly review, mean of attitude/behaviour/skill, 1..5) ──
  attitudeRating: number | null;
  // ── Team-Work (peer + subordinate review mean, 1..5) ──
  teamworkRating: number | null;
  tenureDays: number;
}

export interface PillarScore {
  /** 0..1 rate (null = no data → excluded from the score). */
  rate: number | null;
  /** weight applied (from cfg.weights). */
  weight: number;
  /** per-sub-signal detail for the UI (0..1 or null). */
  detail?: Record<string, number | null>;
}

export interface ScoreBreakdown {
  kpi: PillarScore;
  skillUpgrade: PillarScore;
  compliance: PillarScore;
  attitude: PillarScore;
  teamwork: PillarScore;
}

export interface ScoreResult {
  score: number; // 0..100
  breakdown: ScoreBreakdown;
}

/** Normalise a 1..5 review rating to 0..1 via the configured floor/ceil. */
function ratingRate(rating: number | null, cfg: PmsScoreConfig): number | null {
  if (rating === null || !Number.isFinite(rating)) return null;
  const { ratingFloor, ratingCeil } = cfg.formula;
  const span = ratingCeil - ratingFloor;
  return span > 0 ? clamp01((rating - ratingFloor) / span) : null;
}

/** ratio against a (pro-rated) target; null when the target is 0. */
function vsTarget(actual: number, target: number): number | null {
  return target > 0 ? clamp01(actual / target) : null;
}

/** Compute the 0–100 score. PURE; reads ALL policy from `cfg`. */
export function computeScore(input: ScoreInput, cfg: PmsScoreConfig): ScoreResult {
  const { weights, formula, thresholds } = cfg;
  const pf = clamp01(input.periodFraction) || 1; // never zero-divide; default full period

  // ── KPI: weekly-goals % + incentive attainment % ──
  const kpiWeekly = input.weeklyGoalPct === null ? null : clamp01(input.weeklyGoalPct / 100);
  const kpiIncentive =
    input.incentiveAttainmentPct === null ? null : clamp01(input.incentiveAttainmentPct / 100);
  const kpiRate = blend([
    { rate: kpiWeekly, weight: formula.kpiWeeklyWeight },
    { rate: kpiIncentive, weight: formula.kpiIncentiveWeight },
  ]);

  // ── Skill-Upgrade: attended / given(managers) / self-learn / weekly share ──
  const attendRate = vsTarget(input.trainAttendedHours, thresholds.trainAttendHoursPerMonth * pf);
  const giveRate = input.isManager
    ? vsTarget(input.trainGivenHours, thresholds.trainGiveHoursPerMonth * pf)
    : null; // non-managers: no give obligation → excluded
  const selfRate = vsTarget(input.selfLearnHours, thresholds.selfLearnHoursPerMonth * pf);
  const shareRate = vsTarget(input.sharesDone, input.weeksInPeriod * pf);
  const skillRate = blend([
    { rate: attendRate, weight: formula.skillAttendWeight },
    { rate: giveRate, weight: formula.skillGiveWeight },
    { rate: selfRate, weight: formula.skillSelfLearnWeight },
    { rate: shareRate, weight: formula.skillShareWeight },
  ]);

  // ── Compliance: DCC + Daily Checklist ──
  const dccRate = vsTarget(input.dccDoneCount, input.dccDueCount);
  const checklistRate = vsTarget(input.checklistDoneCount, input.checklistDueCount);
  const complianceRate = blend([
    { rate: dccRate, weight: formula.compDccWeight },
    { rate: checklistRate, weight: formula.compChecklistWeight },
  ]);

  // ── Attitude + Team-Work: review ratings ──
  const attitudeRate = ratingRate(input.attitudeRating, cfg);
  const teamworkRate = ratingRate(input.teamworkRating, cfg);

  const breakdown: ScoreBreakdown = {
    kpi: {
      rate: kpiRate,
      weight: weights.kpi,
      detail: { weekly: kpiWeekly, incentive: kpiIncentive },
    },
    skillUpgrade: {
      rate: skillRate,
      weight: weights.skillUpgrade,
      detail: { attended: attendRate, given: giveRate, selfLearn: selfRate, share: shareRate },
    },
    compliance: {
      rate: complianceRate,
      weight: weights.compliance,
      detail: { dcc: dccRate, checklist: checklistRate },
    },
    attitude: { rate: attitudeRate, weight: weights.attitude },
    teamwork: { rate: teamworkRate, weight: weights.teamwork },
  };

  // Weighted mean over pillars that HAVE data, ×100.
  let weightedSum = 0;
  let weightTotal = 0;
  for (const pillar of Object.values(breakdown)) {
    if (pillar.rate === null) continue;
    weightedSum += pillar.rate * pillar.weight;
    weightTotal += pillar.weight;
  }
  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;
  return { score: Math.max(0, Math.min(100, score)), breakdown };
}
