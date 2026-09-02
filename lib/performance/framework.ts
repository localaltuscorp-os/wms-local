/**
 * ALTUS PERFORMANCE ENGINE — the macro-weightage framework.
 *
 * PURE + CLIENT-SAFE. The single source of truth for the Manager / Non-Manager
 * scorecard buckets and their weights. The KPI bucket is computed from KPI
 * actuals (the incentive-payout driver); every other bucket is a 0..100 score
 * (manager-entered in v1; Monthly Goals auto-derives from WMS later).
 *
 * Spec: docs/superpowers/specs/2026-07-27-performance-incentive-engine-plan.md
 */

export type RoleClass = "manager" | "non-manager";

export interface Bucket {
  id: string;
  label: string;
  /** Macro weight — percent of the 100-point scorecard. */
  weight: number;
  /** "kpi" → computed from KPI actuals; "score" → a 0..100 entered value. */
  kind: "kpi" | "score";
}

export const ROLE_CLASSES: { value: RoleClass; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "non-manager", label: "Non-Manager" },
];

/** Each set totals 100. Order = display order in the scorecard. */
export const MACRO_BUCKETS: Record<RoleClass, Bucket[]> = {
  manager: [
    { id: "kpi", label: "KPI Incentives", weight: 40, kind: "kpi" },
    { id: "goals", label: "Monthly Goals", weight: 20, kind: "score" },
    { id: "culture", label: "Altus Culture", weight: 10, kind: "score" },
    { id: "skillUpgrade", label: "Skill Upgrade", weight: 5, kind: "score" },
    { id: "knowledgeSharing", label: "Knowledge Sharing", weight: 5, kind: "score" },
    { id: "problemSolving", label: "Problem Solving", weight: 5, kind: "score" },
    { id: "growthMindset", label: "Growth Mindset", weight: 5, kind: "score" },
    { id: "mih", label: "MIH (Make It Happen) from Others", weight: 5, kind: "score" },
    { id: "teamNurture", label: "Team Nurture", weight: 5, kind: "score" },
  ],
  "non-manager": [
    { id: "kpi", label: "KPI Incentives", weight: 20, kind: "kpi" },
    { id: "goals", label: "Monthly Goals", weight: 30, kind: "score" },
    { id: "culture", label: "Altus Culture", weight: 15, kind: "score" },
    { id: "problemSolving", label: "Problem Solving", weight: 10, kind: "score" },
    { id: "growthMindset", label: "Growth Mindset", weight: 10, kind: "score" },
    { id: "attendTraining", label: "Attend Training", weight: 5, kind: "score" },
    { id: "skillUpgrade", label: "Skill Upgrade", weight: 5, kind: "score" },
    { id: "teamPlayer", label: "Team Player", weight: 5, kind: "score" },
  ],
};

/** The KPI bucket's macro weight for a role (40 manager / 20 non-manager). */
export function kpiWeight(role: RoleClass): number {
  return MACRO_BUCKETS[role].find((b) => b.kind === "kpi")?.weight ?? 0;
}

/** The non-KPI (0..100 score) buckets for a role. */
export function scoreBuckets(role: RoleClass): Bucket[] {
  return MACRO_BUCKETS[role].filter((b) => b.kind === "score");
}

/** Weeks-per-month multiplier for converting weekly KPI targets to a month. */
export const WEEKS_PER_MONTH = 4.345;
