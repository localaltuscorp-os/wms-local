/**
 * Weighted Candidate-Evaluation scoring — the pure, CLIENT-SAFE core (no server
 * imports, so both client screens and server pages/actions can use it).
 *
 * A super-admin can assign a weight (0..100) to each of the eight EVAL_CATEGORIES
 * sections; the weights must total 100. The overall score then becomes a weighted
 * blend of the per-section averages instead of a flat average over every
 * criterion. Unrated sections are ignored and the weights re-normalise over the
 * rated ones, so a half-filled form still yields a sane 0..10 number.
 *
 * The server read (`getEvaluationWeights`) + the save action
 * (`setEvaluationWeights`) live in app/(app)/hr/eval-weights-actions.ts to keep
 * this module free of `@/lib/db` (which is node-only) so client components can
 * import `weightedOverall` safely.
 */

import {
  EVAL_CATEGORIES,
  TOTAL_CRITERIA,
  categoryScore,
  overallScore,
  type Ratings,
  type Score,
} from "@/lib/hr/candidate/evaluation-checklist";

/** categoryId → weight (0..100). A complete map totals 100. */
export type EvaluationWeights = Record<string, number>;

/**
 * EQUAL weights across the eight sections, totalling exactly 100. 100 doesn't
 * divide evenly by 8, so the remainder is spread one-per-section across the
 * first few — keeping every weight an integer and the sum exactly 100.
 */
export function equalWeights(): EvaluationWeights {
  const n = EVAL_CATEGORIES.length;
  const base = Math.floor(100 / n);
  let remainder = 100 - base * n;
  const out: EvaluationWeights = {};
  for (const cat of EVAL_CATEGORIES) {
    out[cat.id] = base + (remainder-- > 0 ? 1 : 0);
  }
  return out;
}

/**
 * Coerce a stored/edited weights blob into a complete, clean map over the eight
 * known sections — unknown keys dropped, missing/invalid entries defaulted to 0,
 * negatives clamped to 0. Always returns every section id.
 */
export function normalizeWeights(raw: Record<string, unknown> | null | undefined): EvaluationWeights {
  const out: EvaluationWeights = {};
  for (const cat of EVAL_CATEGORIES) {
    const v = raw?.[cat.id];
    out[cat.id] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return out;
}

/** Running total of the weights across the eight sections. */
export function weightsTotal(weights: EvaluationWeights): number {
  return EVAL_CATEGORIES.reduce((s, cat) => s + (Number(weights[cat.id]) || 0), 0);
}

/** True when the weights total exactly 100 (float-tolerant). */
export function sumTo100(weights: EvaluationWeights): boolean {
  return Math.round(weightsTotal(weights) * 100) / 100 === 100;
}

/**
 * The WEIGHTED overall score (0..10) as a {@link Score}, so it drops into the
 * same pills/banners the flat overall uses.
 *
 *   weightedAvg = Σ(categoryAvg_i × weight_i) / Σ(weight_i)   over RATED sections
 *
 * Unrated sections contribute nothing and their weight is excluded from the
 * denominator (re-normalisation), so a partially-filled form stays meaningful.
 * If no rated section carries weight, it falls back to the flat overall average.
 * `rated`/`total` report the underlying rated-criteria counts, unchanged.
 */
export function weightedOverall(ratings: Ratings, weights: EvaluationWeights): Score {
  let weightedSum = 0;
  let weightDenom = 0;
  let ratedCriteria = 0;

  for (const cat of EVAL_CATEGORIES) {
    const cs = categoryScore(cat, ratings);
    ratedCriteria += cs.rated;
    if (cs.rated === 0) continue; // ignore unrated sections entirely
    const w = Math.max(0, Number(weights[cat.id]) || 0);
    if (w <= 0) continue;
    weightedSum += cs.avg * w;
    weightDenom += w;
  }

  if (weightDenom === 0) {
    // Nothing rated, or no rated section is weighted — fall back to a plain
    // average so the headline number never collapses to a misleading 0.
    return overallScore(ratings);
  }
  return { avg: weightedSum / weightDenom, rated: ratedCriteria, total: TOTAL_CRITERIA };
}
