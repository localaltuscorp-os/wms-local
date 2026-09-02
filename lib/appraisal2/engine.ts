/**
 * Appraisal v2 — pure compute engine (ROLE-BASED). NO DB, NO server-only:
 * deterministic functions over already-loaded rows, so it is unit-testable and
 * callable from either tier.
 *
 * The heavy lifting is delegated to the shared performance core
 * (lib/performance/scoring · computeScorecard): micro-achievement per KPI line →
 * internal KPI % (the incentive driver) → weighted with every 0-100 dimension
 * score → total /100. This module just adapts that result into the Appraisal
 * UI's {@link AppraisalScorecard} shape and attaches the rating band.
 *
 * Management scores are the FINAL values that count for the 0-100 dimensions.
 */
import {
  computeScorecard as computePerformance,
  type ScorecardResult,
} from "@/lib/performance/scoring";
import type { KpiTarget } from "@/lib/performance/kpi-dictionary";
import {
  ratingBand,
  resolveRoleWeights,
  type AppraisalScorecard,
  type DimensionScoreRow,
  type KpiActuals,
  type PerDimension,
  type RoleClass,
} from "./types";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Build the performance bucket-scores map from the FINAL (management) scores. */
function toBucketScores(dimScores: DimensionScoreRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dimScores) {
    if (d.managementScore != null) out[d.dimensionKey] = d.managementScore;
  }
  return out;
}

/**
 * Run the shared performance core for one employee. Returns the raw
 * {@link ScorecardResult} (used for the Dossier + narrative) alongside the
 * adapted {@link AppraisalScorecard} the dimension cards render from.
 */
export function computeScorecard(params: {
  employeeId: string;
  role: RoleClass;
  kpiTarget: KpiTarget | null;
  kpiActuals: KpiActuals;
  dimScores: DimensionScoreRow[];
  /** Optional per-dimension weight override (bucket id → weight). */
  weightsOverride?: Record<string, number> | null;
  status?: string;
}): { scorecard: AppraisalScorecard; result: ScorecardResult } {
  const {
    employeeId,
    role,
    kpiTarget,
    kpiActuals,
    dimScores,
    weightsOverride,
    status = "in_progress",
  } = params;

  const weights = resolveRoleWeights(role, weightsOverride);
  const result = computePerformance(role, kpiTarget, kpiActuals, toBucketScores(dimScores));

  const perDimension: PerDimension[] = result.buckets.map((b) => {
    const weight = weights[b.id] ?? b.weight;
    const pct = round1(b.score);
    return {
      key: b.id,
      label: b.label,
      kind: b.kind,
      pct,
      weight,
      contribution: round1((pct * weight) / 100),
    };
  });

  const total = round1(perDimension.reduce((s, p) => s + p.contribution, 0));
  const rating = ratingBand(total);

  const scorecard: AppraisalScorecard = {
    employeeId,
    roleClass: role,
    perDimension,
    total,
    band: rating.band,
    color: rating.color,
    ratingLabel: rating.label,
    internalKpi: round1(result.internalKPI),
    incentivePct: round1(result.incentivePct),
    status,
  };

  return { scorecard, result };
}
