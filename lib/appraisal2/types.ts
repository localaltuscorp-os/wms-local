/**
 * Appraisal v2 — client-safe shared types + constants (ROLE-BASED FRAMEWORK).
 *
 * NO server imports here (no "server-only", no db) — this module is imported by
 * both server actions and client components, so it must stay pure/isomorphic.
 *
 * ONE LIVE ROLLING SCORECARD per employee. Each person is a Manager or a
 * Non-Manager; the role selects the dimension set + weights from the shared
 * performance framework (lib/performance/framework · MACRO_BUCKETS). The KPI
 * dimension is the incentive driver — computed from the person's KPI-dictionary
 * targets (never entered as a 0-100 score); its internal KPI % IS the Final
 * Incentive Authorization %. Every OTHER dimension is a 0-100 score entered
 * Self (advisory) + Manager (advisory) + Management (final). Overall /100 =
 * Σ(dimensionPct × weight/100) over the role's dimensions.
 */

import {
  MACRO_BUCKETS,
  ROLE_CLASSES,
  kpiWeight,
  scoreBuckets,
  type Bucket,
  type RoleClass,
} from "@/lib/performance/framework";

export {
  MACRO_BUCKETS,
  ROLE_CLASSES,
  kpiWeight,
  scoreBuckets,
  type Bucket,
  type RoleClass,
};

/** Tier that produced a score. Management is FINAL. */
export type ScoreTier = "self" | "manager" | "management";

/** The role's dimensions in display order (id/label/weight/kind). */
export function dimensionsForRole(role: RoleClass): Bucket[] {
  return MACRO_BUCKETS[role];
}

/**
 * Resolve a role's dimension weights: the framework defaults, with a saved
 * per-employee override applied ONLY for that role's own bucket ids (a finite,
 * ≥0 number). Legacy/foreign keys in the override are ignored.
 */
export function resolveRoleWeights(
  role: RoleClass,
  override?: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of MACRO_BUCKETS[role]) {
    const v = Number(override?.[b.id]);
    out[b.id] = Number.isFinite(v) && v >= 0 ? v : b.weight;
  }
  return out;
}

/** Rating band for a 0-100 pct. >=80 green · >=60 amber · else red. */
export type RatingBand = "green" | "amber" | "red";

export function ratingBand(pct: number): { band: RatingBand; color: string; label: string } {
  if (pct >= 80) return { band: "green", color: "#16a34a", label: "Strong" };
  if (pct >= 60) return { band: "amber", color: "#d97706", label: "On track" };
  return { band: "red", color: "#dc2626", label: "Needs focus" };
}

// ─── Row interfaces (client-safe mirrors of the appr_* tables) ──────────────

export interface ConfigRow {
  id: string;
  employeeId: string;
  managerId: string | null;
  managementId: string | null;
  roleClass: RoleClass;
  /** Optional per-dimension weight override, keyed by bucket id. */
  dimensionWeights: Record<string, number>;
  incentiveTarget: string | null;
  updatedById: string | null;
}

/** One role dimension's Self/Manager/Management (0-100) scores + notes. */
export interface DimensionScoreRow {
  dimensionKey: string;
  selfScore: number | null;
  selfNote: string | null;
  managerScore: number | null;
  managerNote: string | null;
  managementScore: number | null;
  managementNote: string | null;
}

/** KPI-dictionary line actuals — { lineId: actual }. */
export type KpiActuals = Record<string, number>;

/** One dimension's computed contribution to the overall total. */
export interface PerDimension {
  key: string;
  label: string;
  /** 'kpi' (computed from actuals) | 'score' (0-100 entered). */
  kind: "kpi" | "score";
  /** 0-100 dimension percentage. */
  pct: number;
  /** Dimension weight (out of 100). */
  weight: number;
  /** pct × weight/100 — points this dimension adds to the /100 total. */
  contribution: number;
}

/** The fully-computed live scorecard for one employee. */
export interface AppraisalScorecard {
  employeeId: string;
  roleClass: RoleClass;
  perDimension: PerDimension[];
  /** Overall 0-100 final score. */
  total: number;
  band: RatingBand;
  color: string;
  ratingLabel: string;
  /** 0-100 internal KPI score. */
  internalKpi: number;
  /** 0-100 — the Final Incentive Authorization % (= internalKpi). */
  incentivePct: number;
  /** 'in_progress' | 'finalized' */
  status: string;
}
