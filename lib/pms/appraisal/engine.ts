import {
  APPRAISAL_DIMENSIONS,
  APPRAISAL_DIMENSION_LABELS,
  type AppraisalDimension,
  type AppraisalItemStatus,
} from "@/db/enums";
import {
  effectiveWeights,
  ratingTermFor,
  type ResolvedAppraisalConfig,
} from "./config";

/**
 * The appraisal scoring engine — the ONE place the multi-dimension roll-up
 * lives. It is a pure function over already-loaded items + their score rows +
 * the resolved config, so it runs identically on the server (page loads,
 * finalize) and stays trivially testable. No DB access here.
 *
 * Points model — everything is expressed as points out of 100:
 *   effectiveWeights (config. ×renormalise for non-managers) sum to 100.
 *   Within a dimension, item sub-weights are normalised to shares summing to 1,
 *   so item maxPoints = share × dimensionWeight and Σ item maxPoints =
 *   dimensionWeight exactly (robust even if the admin's sub-weights don't add to
 *   100). Item earnedPoints = finalFraction × maxPoints.
 *   Overall finalPct = Σ earnedPoints over dimensions THAT HAVE ITEMS, divided
 *   by the weight of those same dimensions (so an unbuilt dimension never
 *   silently drags the live score to zero).
 *
 * Final-fraction rule (hand-scored items): Management (the owner/"sir") is the
 * authority — its score wins; else the manager's; else self. Scores are 0..10
 * (house pms convention) → fraction = score/10. Auto dimensions (incentive /
 * knowledge_sharing) compute their fraction from the item meta.
 */

export interface EngineScore {
  selfScore: string | number | null;
  selfJustification: string | null;
  selfSubmittedAt: Date | string | null;
  managerScore: string | number | null;
  managerExplanation: string | null;
  managerSubmittedAt: Date | string | null;
  managementScore: string | number | null;
  managementExplanation: string | null;
  managementSubmittedAt: Date | string | null;
  maxScore: string | number | null;
  finalScore: string | number | null;
  finalizedAt: Date | string | null;
}

export interface EngineItem {
  id: string;
  dimension: AppraisalDimension;
  sortOrder: number;
  area: string | null;
  title: string;
  measure: string | null;
  subWeight: string | number | null;
  isTechnical: boolean | null;
  isManagerOnly: boolean;
  isAuto: boolean;
  status: AppraisalItemStatus;
  actualValue: string | null;
  evidence: string | null;
  adminApproved: boolean | null;
  adminRemarks: string | null;
  meta: Record<string, unknown>;
  score: EngineScore | null;
}

export interface ScoredItem extends EngineItem {
  /** Normalised 0..1 final fraction (the value the score bar fills to). */
  fraction: number;
  /** Relative max = share × dimension weight (points out of 100). */
  maxPoints: number;
  /** fraction × maxPoints. */
  earnedPoints: number;
  /** Which stage the winning score came from. */
  stage: "management" | "manager" | "self" | "auto" | "none";
}

export interface ScoredDimension {
  dimension: AppraisalDimension;
  label: string;
  weight: number;
  items: ScoredItem[];
  maxPoints: number;
  earnedPoints: number;
  /** 0..100 within the dimension. */
  pct: number;
  isAuto: boolean;
}

export interface Scorecard {
  dimensions: ScoredDimension[];
  earnedTotal: number;
  weightPresent: number;
  finalPct: number;
  ratingTerm: string;
  isManager: boolean;
}

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function metaNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta?.[key];
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Incentive auto-fraction: min(1, (earned/base)/target). */
export function incentiveFraction(
  meta: Record<string, unknown>,
  config: ResolvedAppraisalConfig,
): number {
  const earned = metaNum(meta, "earned") ?? 0;
  const base = metaNum(meta, "baseSalary") ?? 0;
  const target = metaNum(meta, "targetPct") ?? config.incentiveTargetPct;
  if (base <= 0 || target <= 0) return 0;
  const asPct = (earned / base) * 100;
  return Math.max(0, Math.min(1, asPct / target));
}

/** Knowledge-sharing auto-fraction from the do/give rule. */
export function knowledgeSharingFraction(
  meta: Record<string, unknown>,
  config: ResolvedAppraisalConfig,
): number {
  const done = metaNum(meta, "done") ?? 0;
  const given = metaNum(meta, "given") ?? 0;
  const { do: needDo, give: needGive } = config.knowledgeSharingRule;
  const doFrac = needDo > 0 ? Math.min(1, done / needDo) : 0;
  const giveFrac = needGive > 0 ? Math.min(1, given / needGive) : 0;
  return Math.max(0, Math.min(1, 0.5 * doFrac + 0.5 * giveFrac));
}

/** The winning fraction (0..1) + which stage produced it, for one item. */
export function itemFraction(
  item: EngineItem,
  config: ResolvedAppraisalConfig,
): { fraction: number; stage: ScoredItem["stage"] } {
  if (item.isAuto || item.dimension === "incentive" || item.dimension === "knowledge_sharing") {
    const f =
      item.dimension === "incentive"
        ? incentiveFraction(item.meta, config)
        : knowledgeSharingFraction(item.meta, config);
    return { fraction: f, stage: "auto" };
  }
  const s = item.score;
  const mgmt = num(s?.managementScore ?? null);
  const mgr = num(s?.managerScore ?? null);
  const self = num(s?.selfScore ?? null);
  if (mgmt != null) return { fraction: clamp01(mgmt / 10), stage: "management" };
  if (mgr != null) return { fraction: clamp01(mgr / 10), stage: "manager" };
  if (self != null) return { fraction: clamp01(self / 10), stage: "self" };
  return { fraction: 0, stage: "none" };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Roll up a person's items into a full scorecard. `weights` are the effective
 * (renormalised) per-dimension weights for this employee.
 */
export function computeScorecard(
  items: EngineItem[],
  config: ResolvedAppraisalConfig,
  isManager: boolean,
): Scorecard {
  const weights = effectiveWeights(config, isManager);
  const byDim = new Map<AppraisalDimension, EngineItem[]>();
  for (const it of items) {
    const arr = byDim.get(it.dimension) ?? [];
    arr.push(it);
    byDim.set(it.dimension, arr);
  }

  const dimensions: ScoredDimension[] = [];
  let earnedTotal = 0;
  let weightPresent = 0;

  for (const dim of APPRAISAL_DIMENSIONS) {
    const raw = byDim.get(dim) ?? [];
    if (raw.length === 0) continue; // unbuilt → not in the denominator
    const weight = weights[dim] ?? 0;
    const sorted = [...raw].sort((a, b) => a.sortOrder - b.sortOrder);

    const subSum = sorted.reduce((s, it) => s + Math.max(0, num(it.subWeight) ?? 0), 0);
    const scoredItems: ScoredItem[] = sorted.map((it) => {
      const share =
        subSum > 0 ? Math.max(0, num(it.subWeight) ?? 0) / subSum : 1 / sorted.length;
      const maxPoints = share * weight;
      const { fraction, stage } = itemFraction(it, config);
      const earnedPoints = fraction * maxPoints;
      return { ...it, fraction, maxPoints, earnedPoints, stage };
    });

    const dimEarned = scoredItems.reduce((s, it) => s + it.earnedPoints, 0);
    const dimMax = scoredItems.reduce((s, it) => s + it.maxPoints, 0);
    dimensions.push({
      dimension: dim,
      label: APPRAISAL_DIMENSION_LABELS[dim],
      weight,
      items: scoredItems,
      maxPoints: dimMax,
      earnedPoints: dimEarned,
      pct: dimMax > 0 ? (dimEarned / dimMax) * 100 : 0,
      isAuto: dim === "incentive" || dim === "knowledge_sharing",
    });
    earnedTotal += dimEarned;
    weightPresent += weight;
  }

  const finalPct = weightPresent > 0 ? (earnedTotal / weightPresent) * 100 : 0;
  return {
    dimensions,
    earnedTotal,
    weightPresent,
    finalPct,
    ratingTerm: ratingTermFor(config, finalPct),
    isManager,
  };
}
