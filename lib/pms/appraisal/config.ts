import "server-only";
import { eq } from "drizzle-orm";
import { db, appraisalConfig } from "@/lib/db";
import {
  APPRAISAL_DIMENSIONS,
  APPRAISAL_MANAGER_ONLY_DIMENSIONS,
  DEFAULT_APPRAISAL_DIMENSION_WEIGHTS,
  DEFAULT_APPRAISAL_RATING_TERMS,
  type AppraisalDimension,
} from "@/db/enums";

/**
 * Resolved (defaults-merged) appraisal configuration. The DB row is a singleton
 * ('default'); anything unset falls back to the seed constants in db/enums.ts so
 * the engine always has a full, valid config even before the admin ever saves.
 */
export interface ResolvedAppraisalConfig {
  dimensionWeights: Record<AppraisalDimension, number>;
  ratingTerms: Array<{ min: number; label: string }>;
  incentiveTargetPct: number;
  knowledgeSharingRule: { do: number; give: number };
  culturePerMonth: number;
}

/** Merge a stored (possibly-partial) config over the seed defaults. */
export function resolveConfig(
  row: {
    dimensionWeights?: Partial<Record<AppraisalDimension, number>> | null;
    ratingTerms?: Array<{ min: number; label: string }> | null;
    incentiveTargetPct?: string | number | null;
    knowledgeSharingRule?: { do: number; give: number } | null;
    culturePerMonth?: number | null;
  } | null,
): ResolvedAppraisalConfig {
  const weights = { ...DEFAULT_APPRAISAL_DIMENSION_WEIGHTS };
  if (row?.dimensionWeights) {
    for (const d of APPRAISAL_DIMENSIONS) {
      const v = row.dimensionWeights[d];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) weights[d] = v;
    }
  }
  const ratingTerms =
    row?.ratingTerms && row.ratingTerms.length > 0
      ? [...row.ratingTerms].sort((a, b) => b.min - a.min)
      : DEFAULT_APPRAISAL_RATING_TERMS.map((t) => ({ ...t }));

  const targetRaw =
    row?.incentiveTargetPct == null ? 20 : Number(row.incentiveTargetPct);
  const incentiveTargetPct =
    Number.isFinite(targetRaw) && targetRaw > 0 ? targetRaw : 20;

  const ksr = row?.knowledgeSharingRule;
  const knowledgeSharingRule = {
    do: ksr && Number.isFinite(ksr.do) && ksr.do > 0 ? ksr.do : 6,
    give: ksr && Number.isFinite(ksr.give) && ksr.give > 0 ? ksr.give : 4,
  };

  const culturePerMonth =
    row?.culturePerMonth && row.culturePerMonth > 0 ? row.culturePerMonth : 3;

  return {
    dimensionWeights: weights,
    ratingTerms,
    incentiveTargetPct,
    knowledgeSharingRule,
    culturePerMonth,
  };
}

/** Load + resolve the singleton config (one row, id 'default'). */
export async function loadAppraisalConfig(): Promise<ResolvedAppraisalConfig> {
  const [row] = await db
    .select()
    .from(appraisalConfig)
    .where(eq(appraisalConfig.id, "default"))
    .limit(1);
  return resolveConfig(row ?? null);
}

/**
 * The dimensions that apply to a given employee. Non-managers drop the three
 * manager-only subjective one-liners (problem_solving / growth_mindset /
 * ability).
 */
export function dimensionsFor(isManager: boolean): AppraisalDimension[] {
  const managerOnly = new Set<AppraisalDimension>(
    APPRAISAL_MANAGER_ONLY_DIMENSIONS,
  );
  return APPRAISAL_DIMENSIONS.filter((d) => isManager || !managerOnly.has(d));
}

/**
 * Effective per-dimension weights for an employee — the configured weights over
 * that person's applicable dimensions, RENORMALISED to sum to 100. Non-managers
 * lose the manager-only dimensions and the remaining weights scale up.
 */
export function effectiveWeights(
  config: ResolvedAppraisalConfig,
  isManager: boolean,
): Record<AppraisalDimension, number> {
  const dims = dimensionsFor(isManager);
  const raw = dims.reduce((s, d) => s + (config.dimensionWeights[d] ?? 0), 0);
  const out = {} as Record<AppraisalDimension, number>;
  for (const d of APPRAISAL_DIMENSIONS) out[d] = 0;
  if (raw <= 0) return out;
  const scale = 100 / raw;
  for (const d of dims) out[d] = (config.dimensionWeights[d] ?? 0) * scale;
  return out;
}

/** Map a final percentage (0..100) to its configured rating-term label. */
export function ratingTermFor(
  config: ResolvedAppraisalConfig,
  finalPct: number,
): string {
  for (const band of config.ratingTerms) {
    if (finalPct >= band.min) return band.label;
  }
  return config.ratingTerms[config.ratingTerms.length - 1]?.label ?? "—";
}
