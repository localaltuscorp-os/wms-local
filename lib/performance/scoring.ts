/**
 * ALTUS PERFORMANCE ENGINE — the PURE, deterministic scoring core.
 *
 * Every figure in the Dossier is computed here (the LLM narrative NEVER produces
 * numbers). Micro-achievement per KPI line → internal KPI score (the incentive
 * payout driver) → macro KPI → + weighted non-KPI buckets → total /100.
 *
 * PURE + CLIENT-SAFE. Spec:
 * docs/superpowers/specs/2026-07-27-performance-incentive-engine-plan.md
 */

import {
  MACRO_BUCKETS,
  kpiWeight,
  WEEKS_PER_MONTH,
  type RoleClass,
} from "@/lib/performance/framework";
import type { KpiTarget, KpiLine } from "@/lib/performance/kpi-dictionary";

/** lineId → the month's actual achievement. */
export type KpiActuals = Record<string, number>;
/** bucketId → 0..100 entered score (non-KPI buckets). */
export type BucketScores = Record<string, number>;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A weekly target scaled to the month; monthly targets pass through. */
export function monthlyTarget(line: KpiLine): number {
  return line.period === "week" ? line.target * WEEKS_PER_MONTH : line.target;
}

export interface KpiLineResult {
  id: string;
  label: string;
  period: "week" | "month";
  target: number;
  monthlyTarget: number;
  actual: number;
  /** 0..1 achievement, capped. */
  micro: number;
  intraWeight: number;
  /** micro × intraWeight — the line's contribution to the internal KPI score. */
  weightedPoints: number;
  unit?: string;
}

export interface BucketResult {
  id: string;
  label: string;
  weight: number;
  kind: "kpi" | "score";
  /** 0..100 — internal KPI score for the KPI bucket, else the entered score. */
  score: number;
  /** score × (weight / 100) — points toward the /100 total. */
  macro: number;
}

export interface ScorecardResult {
  roleClass: RoleClass;
  /** 0..100 — the internal KPI score = the incentive-authorization %. */
  internalKPI: number;
  /** internalKPI × (kpiWeight / 100). */
  macroKPI: number;
  kpiLines: KpiLineResult[];
  buckets: BucketResult[];
  /** 0..100 total scorecard. */
  totalScore: number;
  /** 0..100 — the % of eligible incentive unlocked (= internalKPI). */
  incentivePct: number;
}

/** The internal KPI score (0..100) + per-line breakdown. */
export function computeKpi(
  target: KpiTarget | null,
  actuals: KpiActuals,
): { internalKPI: number; lines: KpiLineResult[] } {
  if (!target) return { internalKPI: 0, lines: [] };
  const lines: KpiLineResult[] = target.lines.map((l) => {
    const mt = monthlyTarget(l);
    const actual = Number(actuals[l.id]) || 0;
    const micro = mt > 0 ? clamp(actual / mt, 0, 1) : 0;
    return {
      id: l.id,
      label: l.label,
      period: l.period,
      target: l.target,
      monthlyTarget: round1(mt),
      actual,
      micro,
      intraWeight: l.intraWeight,
      weightedPoints: round1(micro * l.intraWeight),
      unit: l.unit,
    };
  });
  const internalKPI = round1(lines.reduce((s, l) => s + l.micro * l.intraWeight, 0));
  return { internalKPI, lines };
}

/** The full deterministic scorecard for a person + month. */
export function computeScorecard(
  roleClass: RoleClass,
  target: KpiTarget | null,
  actuals: KpiActuals,
  bucketScores: BucketScores,
): ScorecardResult {
  const { internalKPI, lines } = computeKpi(target, actuals);
  const kW = kpiWeight(roleClass);
  const macroKPI = round1(internalKPI * (kW / 100));

  const buckets: BucketResult[] = MACRO_BUCKETS[roleClass].map((b) => {
    if (b.kind === "kpi") {
      return { id: b.id, label: b.label, weight: b.weight, kind: b.kind, score: internalKPI, macro: macroKPI };
    }
    const score = clamp(Number(bucketScores[b.id]) || 0, 0, 100);
    return { id: b.id, label: b.label, weight: b.weight, kind: b.kind, score, macro: round1(score * (b.weight / 100)) };
  });

  const totalScore = round1(buckets.reduce((s, b) => s + b.macro, 0));
  return { roleClass, internalKPI, macroKPI, kpiLines: lines, buckets, totalScore, incentivePct: internalKPI };
}

/** The lowest-scoring bucket (for the action plan). Ignores the KPI bucket ties by weight. */
export function lowestBucket(result: ScorecardResult): BucketResult | null {
  if (result.buckets.length === 0) return null;
  return [...result.buckets].sort((a, b) => a.score - b.score)[0] ?? null;
}

/** The highest-scoring bucket (for the summary). */
export function highestBucket(result: ScorecardResult): BucketResult | null {
  if (result.buckets.length === 0) return null;
  return [...result.buckets].sort((a, b) => b.score - a.score)[0] ?? null;
}
