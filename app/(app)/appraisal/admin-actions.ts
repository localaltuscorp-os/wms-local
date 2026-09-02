"use server";

/**
 * Appraisal v2 — ADMIN CONFIG actions (ROLE-BASED).
 *
 * Standing per-employee configuration for the live rolling scorecard:
 *   • role_class  — Manager | Non-Manager (selects the dimension set + weights).
 *   • assignees   — manager (advisory) + management (FINAL).
 * All writes are ADMIN-only (isAdmin || super-admin), rate-limited, zod-validated.
 *
 * KPI targets come from the shared KPI dictionary (matched by employee name); the
 * KPI actuals + the per-dimension Self/Manager/Management scores are entered in
 * the scorecard itself (score-actions.ts) — this file only shapes role + assignees.
 */

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  apprConfig,
  apprDimensionScore,
  apprScorecard,
  designations,
  employees,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { computeScorecard } from "@/lib/appraisal2/engine";
import { kpiTargetForName } from "@/lib/performance/kpi-dictionary";
import { loadKpiTargetsForEmployees } from "@/lib/performance/kpi-from-assignments";
import type { DimensionScoreRow, KpiActuals, RoleClass } from "@/lib/appraisal2/types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Admin-only guard (config is admin-managed; scoring tiers gate elsewhere). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

async function guardAdmin(): Promise<
  { ok: true; me: Employee } | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return { ok: true, me };
}

const Uuid = z.string().uuid();

/** Normalise an incoming incentive target into a numeric(14,2) string or null. */
function toMoney(v: number | string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

// ─── config (role + assignees + optional incentive target) ────────────────────

const ConfigSchema = z.object({
  employeeId: Uuid,
  roleClass: z.enum(["manager", "non-manager"]).optional(),
  managerId: Uuid.nullable().optional(),
  managementId: Uuid.nullable().optional(),
  incentiveTarget: z.union([z.number(), z.string()]).nullable().optional(),
});

/**
 * Upsert the standing config (create the row on first touch). Only the fields
 * passed are changed; the rest keep their current / default value.
 */
export async function setApprConfig(input: {
  employeeId: string;
  roleClass?: RoleClass;
  managerId?: string | null;
  managementId?: string | null;
  incentiveTarget?: number | string | null;
}): Promise<Result<{ id: string }>> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, roleClass, managerId, managementId } = parsed.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const money = toMoney(parsed.data.incentiveTarget);
  const existing = await db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });

  let id: string;
  if (existing) {
    const patch: Partial<typeof apprConfig.$inferInsert> = {
      updatedById: g.me.id,
      updatedAt: new Date(),
    };
    if (roleClass !== undefined) patch.roleClass = roleClass;
    if (managerId !== undefined) patch.managerId = managerId;
    if (managementId !== undefined) patch.managementId = managementId;
    if (money !== undefined) patch.incentiveTarget = money;
    await db.update(apprConfig).set(patch).where(eq(apprConfig.id, existing.id));
    id = existing.id;
  } else {
    const [row] = await db
      .insert(apprConfig)
      .values({
        employeeId,
        roleClass: roleClass ?? "non-manager",
        managerId: managerId ?? null,
        managementId: managementId ?? null,
        incentiveTarget: money ?? null,
        updatedById: g.me.id,
      })
      .returning({ id: apprConfig.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    id = row.id;
  }

  revalidatePath("/appraisal/admin");
  revalidatePath("/appraisal");
  return { ok: true, id };
}

/** Set the Manager | Non-Manager role class (selects dimensions + weights). */
export async function setRoleClass(input: {
  employeeId: string;
  roleClass: RoleClass;
}): Promise<Result<{ id: string }>> {
  return setApprConfig({ employeeId: input.employeeId, roleClass: input.roleClass });
}

const AssigneesSchema = z.object({
  employeeId: Uuid,
  managerId: Uuid.nullable().optional(),
  managementId: Uuid.nullable().optional(),
});

/** Set the manager (advisory tier) + management (final tier) assignees. */
export async function setAssignees(input: {
  employeeId: string;
  managerId?: string | null;
  managementId?: string | null;
}): Promise<Result<{ id: string }>> {
  const parsed = AssigneesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return setApprConfig({
    employeeId: parsed.data.employeeId,
    managerId: parsed.data.managerId,
    managementId: parsed.data.managementId,
  });
}

// ─── Department roster + totals ───────────────────────────────────────────────

export interface DepartmentRosterEntry {
  employee: {
    id: string;
    name: string;
    department: string | null;
    designation: string | null;
  };
  roleClass: RoleClass;
  total: number;
  incentivePct: number;
  status: string;
}

/**
 * Roster for the admin overview: every active employee (optionally filtered to
 * one department), each with their live computed overall total + incentive % +
 * status. Loads all appr_* rows in bulk and folds them through the pure engine.
 */
export async function listByDepartment(
  dept?: string,
): Promise<Result<{ rows: DepartmentRosterEntry[] }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };

  const wantDept = dept && dept.trim() ? dept.trim() : null;
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(
      wantDept
        ? and(eq(employees.isActive, true), eq(employees.department, wantDept))
        : eq(employees.isActive, true),
    )
    .orderBy(asc(employees.name));

  const ids = empRows.map((e) => e.id);
  if (ids.length === 0) return { ok: true, rows: [] };

  const [configs, dimScores, cards] = await Promise.all([
    db.select().from(apprConfig).where(inArray(apprConfig.employeeId, ids)),
    db.select().from(apprDimensionScore).where(inArray(apprDimensionScore.employeeId, ids)),
    db.select().from(apprScorecard).where(inArray(apprScorecard.employeeId, ids)),
  ]);

  const cfgByEmp = new Map(configs.map((c) => [c.employeeId, c]));
  const cardByEmp = new Map(cards.map((c) => [c.employeeId, c]));
  // KPI targets HR configured in KPI Management take precedence over the hardcoded
  // dictionary — so the KPIs assigned there actually drive appraisal scoring.
  const kpiByEmp = await loadKpiTargetsForEmployees(
    ids,
    new Map(empRows.map((e) => [e.id, e.name])),
  );
  const dimByEmp = new Map<string, DimensionScoreRow[]>();
  for (const s of dimScores) {
    const arr = dimByEmp.get(s.employeeId) ?? [];
    arr.push({
      dimensionKey: s.dimensionKey,
      selfScore: s.selfScore,
      selfNote: s.selfNote,
      managerScore: s.managerScore,
      managerNote: s.managerNote,
      managementScore: s.managementScore,
      managementNote: s.managementNote,
    });
    dimByEmp.set(s.employeeId, arr);
  }

  const rows: DepartmentRosterEntry[] = empRows.map((e) => {
    const cfg = cfgByEmp.get(e.id);
    const card = cardByEmp.get(e.id);
    const role: RoleClass = cfg?.roleClass === "manager" ? "manager" : "non-manager";
    const actuals =
      card?.kpiActuals && typeof card.kpiActuals === "object"
        ? (card.kpiActuals as KpiActuals)
        : {};
    const { scorecard } = computeScorecard({
      employeeId: e.id,
      role,
      kpiTarget: kpiByEmp.get(e.id) ?? kpiTargetForName(e.name),
      kpiActuals: actuals,
      dimScores: dimByEmp.get(e.id) ?? [],
      status: card?.status ?? "in_progress",
    });
    return {
      employee: {
        id: e.id,
        name: e.name,
        department: e.department,
        designation: e.designation,
      },
      roleClass: role,
      total: scorecard.total,
      incentivePct: scorecard.incentivePct,
      status: scorecard.status,
    };
  });

  return { ok: true, rows };
}
