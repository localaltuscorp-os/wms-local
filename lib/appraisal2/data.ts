import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apprConfig,
  apprDimensionScore,
  apprScorecard,
  designations,
  employees,
  type Employee,
} from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { computeScorecard } from "@/lib/appraisal2/engine";
import { kpiTargetForName } from "@/lib/performance/kpi-dictionary";
import { loadKpiTargetForEmployee } from "@/lib/performance/kpi-from-assignments";
import { deterministicNarrative, type PerfNarrative } from "@/lib/performance/narrative";
import type { ScorecardResult } from "@/lib/performance/scoring";
import type { KpiTarget } from "@/lib/performance/kpi-dictionary";
import { forbiddenError } from "@/lib/auth/current";
import {
  type AppraisalScorecard,
  type ConfigRow,
  type DimensionScoreRow,
  type KpiActuals,
  type RoleClass,
} from "@/lib/appraisal2/types";

/**
 * Appraisal v2 — the ONE server-side data loader for a live ROLE-BASED scorecard.
 *
 * Loads the standing config (role_class + assignees + optional weight override),
 * the KPI-dictionary target matched by the employee's name, the Management-entered
 * KPI actuals + the per-dimension Self/Manager/Management scores, then folds them
 * through the pure engine (which reuses the shared performance core) into a fully
 * computed {@link AppraisalScorecard} plus the raw performance result + narrative
 * that drive the Performance & Incentive Dossier.
 */

// ─── row coercions ────────────────────────────────────────────────────────────

function toRole(v: string | null | undefined): RoleClass {
  return v === "manager" ? "manager" : "non-manager";
}

function toWeightOverride(raw: unknown): Record<string, number> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

function toConfigRow(row: typeof apprConfig.$inferSelect): ConfigRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    managerId: row.managerId,
    managementId: row.managementId,
    roleClass: toRole(row.roleClass),
    dimensionWeights: toWeightOverride(row.dimensionWeights),
    incentiveTarget: row.incentiveTarget,
    updatedById: row.updatedById,
  };
}

function toDimScore(s: typeof apprDimensionScore.$inferSelect): DimensionScoreRow {
  return {
    dimensionKey: s.dimensionKey,
    selfScore: s.selfScore,
    selfNote: s.selfNote,
    managerScore: s.managerScore,
    managerNote: s.managerNote,
    managementScore: s.managementScore,
    managementNote: s.managementNote,
  };
}

function toActuals(raw: unknown): KpiActuals {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: KpiActuals = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

// ─── viewer capabilities ──────────────────────────────────────────────────────

export interface ViewerCaps {
  isAdmin: boolean;
  canSelfScore: boolean;
  canManagerScore: boolean;
  canManagementScore: boolean;
}

// ─── the full payload ─────────────────────────────────────────────────────────

export interface ScorecardData {
  employee: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    designation: string | null;
  };
  scorecard: AppraisalScorecard;
  /** Raw performance result — drives the KPI line table + the Dossier. */
  result: ScorecardResult;
  /** Deterministic Executive Summary + directive. */
  narrative: PerfNarrative;
  config: ConfigRow | null;
  dimensionScores: DimensionScoreRow[];
  kpiActuals: KpiActuals;
  kpiTarget: KpiTarget | null;
  card: { status: string; finalizedAt: Date | null } | null;
  viewer: ViewerCaps;
}

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Load everything the Appraisal UI needs for ONE employee's live scorecard.
 *
 * Guarded: the caller passes the signed-in `me`; access is allowed for admin,
 * the employee themselves, the assigned manager, or the assigned management.
 * Returns null when the employee doesn't exist; throws "Forbidden" when the
 * viewer has no right to see this scorecard.
 */
export async function getScorecardData(
  employeeId: string,
  me: Employee,
): Promise<ScorecardData | null> {
  const [emp] = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatarUrl: employees.avatarUrl,
      department: employees.department,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  const cfgRow = await db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });

  const admin = isAdmin(me);
  const isSelf = me.id === employeeId;
  const isMgr = cfgRow?.managerId === me.id;
  const isMgmt = cfgRow?.managementId === me.id || isSuperAdmin(me.email);
  if (!admin && !isSelf && !isMgr && !isMgmt) {
    throw forbiddenError();
  }

  const [dimRows, cardRow] = await Promise.all([
    db
      .select()
      .from(apprDimensionScore)
      .where(eq(apprDimensionScore.employeeId, employeeId))
      .orderBy(asc(apprDimensionScore.dimensionKey)),
    db
      .select()
      .from(apprScorecard)
      .where(eq(apprScorecard.employeeId, employeeId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const config = cfgRow ? toConfigRow(cfgRow) : null;
  const role: RoleClass = config?.roleClass ?? "non-manager";
  const dimensionScores = dimRows.map(toDimScore);
  const kpiActuals = toActuals(cardRow?.kpiActuals);
  // HR-configured KPIs (KPI Management) drive scoring when present; else the
  // hardcoded dictionary (non-breaking for anyone without configured KPIs).
  const kpiTarget = (await loadKpiTargetForEmployee(employeeId, emp.name)) ?? kpiTargetForName(emp.name);

  const { scorecard, result } = computeScorecard({
    employeeId,
    role,
    kpiTarget,
    kpiActuals,
    dimScores: dimensionScores,
    weightsOverride: config?.dimensionWeights ?? null,
    status: cardRow?.status ?? "in_progress",
  });

  const narrative = deterministicNarrative(emp.name, result);

  return {
    employee: {
      id: emp.id,
      name: emp.name,
      avatarUrl: emp.avatarUrl,
      department: emp.department,
      designation: emp.designation,
    },
    scorecard,
    result,
    narrative,
    config,
    dimensionScores,
    kpiActuals,
    kpiTarget,
    card: cardRow ? { status: cardRow.status, finalizedAt: cardRow.finalizedAt } : null,
    viewer: {
      isAdmin: admin,
      canSelfScore: isSelf,
      canManagerScore: isMgr || admin,
      canManagementScore: isMgmt || admin,
    },
  };
}
