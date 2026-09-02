"use server";

/**
 * Appraisal v2 — SCORING actions (ROLE-BASED, tier-guarded).
 *
 *   • setKpiActual        — Management/admin enter the raw actual for one KPI-
 *                           dictionary line (stored in appr_scorecard.kpi_actuals).
 *                           The internal KPI % recomputed from these = the Final
 *                           Incentive Authorization %.
 *   • setDimensionScore   — one role dimension's 0-100 score at a tier:
 *       self       → only the employee themselves.
 *       manager    → only the assigned manager (config.manager_id) or an admin.
 *       management → only the assigned management (config.management_id), a
 *                    super-admin, or an admin. Management is FINAL.
 *   • finalizeScorecard   — flip the scorecard row to 'finalized' (management/
 *                           admin only) + best-effort compose an Appraisal letter.
 *
 * Every action returns { ok:true, ... } | { ok:false, error }.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  apprConfig,
  apprDimensionScore,
  apprScorecard,
  employees,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { MACRO_BUCKETS } from "@/lib/performance/framework";
import type { ScoreTier } from "@/lib/appraisal2/types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const Uuid = z.string().uuid();
const Score = z.number().int().min(0).max(100);

/** The set of valid non-KPI dimension keys across both role sets. */
const DIMENSION_KEYS = new Set<string>(
  [...MACRO_BUCKETS.manager, ...MACRO_BUCKETS["non-manager"]]
    .filter((b) => b.kind === "score")
    .map((b) => b.id),
);

/** Admin = the isAdmin flag OR a super-admin email. */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** requireUser + a write rate-limit in one shot. */
async function guard(): Promise<
  { ok: true; me: Employee } | { ok: false; error: string }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return { ok: true, me };
}

/** The standing config row for an employee (assignees live here). */
async function loadConfig(employeeId: string) {
  return db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });
}

/** Management/admin guard for direct scorecard writes (KPI actuals, finalize). */
function canManage(me: Employee, cfg: { managementId: string | null } | undefined): boolean {
  return cfg?.managementId === me.id || isSuperAdmin(me.email) || isAdmin(me);
}

/** Upsert the single appr_scorecard row for an employee, patching given fields. */
async function upsertScorecard(
  employeeId: string,
  patch: Partial<typeof apprScorecard.$inferInsert>,
  actorId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: apprScorecard.id, kpiActuals: apprScorecard.kpiActuals })
    .from(apprScorecard)
    .where(eq(apprScorecard.employeeId, employeeId))
    .limit(1);
  if (existing) {
    await db
      .update(apprScorecard)
      .set({ ...patch, updatedById: actorId, updatedAt: new Date() })
      .where(eq(apprScorecard.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(apprScorecard)
    .values({ employeeId, ...patch, updatedById: actorId })
    .returning({ id: apprScorecard.id });
  return row!.id;
}

// ─── setKpiActual (Management enters the KPI-line actual) ──────────────────────

const KpiActualSchema = z.object({
  employeeId: Uuid,
  lineId: z.string().trim().min(1).max(80),
  actual: z.number().min(0).max(1_000_000),
});

/**
 * Set the raw actual for one KPI-dictionary line (Management/admin only). Merges
 * into appr_scorecard.kpi_actuals so the internal KPI % (= incentive %) recomputes.
 */
export async function setKpiActual(input: {
  employeeId: string;
  lineId: string;
  actual: number;
}): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = KpiActualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, lineId, actual } = parsed.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const cfg = await loadConfig(employeeId);
  if (!canManage(g.me, cfg)) return { ok: false, error: "Only management can enter KPI actuals." };

  // Read-modify-write the jsonb map.
  const [existing] = await db
    .select({ kpiActuals: apprScorecard.kpiActuals })
    .from(apprScorecard)
    .where(eq(apprScorecard.employeeId, employeeId))
    .limit(1);
  const current =
    existing?.kpiActuals && typeof existing.kpiActuals === "object"
      ? (existing.kpiActuals as Record<string, number>)
      : {};
  const next = { ...current, [lineId]: actual };

  const id = await upsertScorecard(employeeId, { kpiActuals: next }, g.me.id);
  revalidatePath("/appraisal");
  return { ok: true, id };
}

// ─── setDimensionScore (tiered 0-100 score for one role dimension) ─────────────

const DimensionScoreSchema = z.object({
  employeeId: Uuid,
  dimensionKey: z.string().trim().min(1).max(60),
  tier: z.enum(["self", "manager", "management"]),
  score: Score,
  note: z.string().trim().max(2000).optional(),
});

/**
 * Upsert one role dimension's score at the given tier (keyed by the UNIQUE
 * (employee_id, dimension_key)). Tier-guarded; only the columns that tier owns
 * are written, leaving the other tiers untouched.
 */
export async function setDimensionScore(input: {
  employeeId: string;
  dimensionKey: string;
  tier: ScoreTier;
  score: number;
  note?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = DimensionScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, dimensionKey, tier, score, note } = parsed.data;

  if (!DIMENSION_KEYS.has(dimensionKey)) {
    return { ok: false, error: "Unknown dimension." };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const me = g.me;
  const admin = isAdmin(me);
  const cfg = await loadConfig(employeeId);

  // Tier guard.
  if (tier === "self") {
    if (me.id !== employeeId) {
      return { ok: false, error: "Only the employee can enter their self score." };
    }
  } else if (tier === "manager") {
    if (!(cfg?.managerId === me.id || admin)) {
      return { ok: false, error: "Only the assigned manager can enter the manager score." };
    }
  } else {
    if (!canManage(me, cfg)) {
      return { ok: false, error: "Only management can enter the final score." };
    }
  }

  const patch: Partial<typeof apprDimensionScore.$inferInsert> = {
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (tier === "self") {
    patch.selfScore = score;
    if (note !== undefined) patch.selfNote = note || null;
  } else if (tier === "manager") {
    patch.managerScore = score;
    if (note !== undefined) patch.managerNote = note || null;
  } else {
    patch.managementScore = score;
    if (note !== undefined) patch.managementNote = note || null;
  }

  const [row] = await db
    .insert(apprDimensionScore)
    .values({ employeeId, dimensionKey, ...patch })
    .onConflictDoUpdate({
      target: [apprDimensionScore.employeeId, apprDimensionScore.dimensionKey],
      set: patch,
    })
    .returning({ id: apprDimensionScore.id });
  if (!row) return { ok: false, error: "Upsert returned no row" };

  revalidatePath("/appraisal");
  return { ok: true, id: row.id };
}

// ─── finalizeScorecard ────────────────────────────────────────────────────────

/**
 * Best-effort: record an Appraisal-letter draft via the HR letters module.
 * NEVER throws — a missing module/template or any error is swallowed.
 */
async function composeAppraisalLetter(employeeId: string): Promise<void> {
  try {
    const mod = (await import("@/lib/hr/letters/issue-core")) as {
      composeDraft?: (input: {
        typeKey: string;
        employeeId?: string | null;
      }) => Promise<{ ok: boolean } | undefined>;
    };
    if (typeof mod.composeDraft === "function") {
      await mod.composeDraft({ typeKey: "appraisal_ctc", employeeId });
    }
  } catch {
    // HR-docs not present / template missing / any error → ignore.
  }
}

/**
 * Finalize the live scorecard — flip status to 'finalized' + stamp finalized_at.
 * Management (config.management_id) / super-admin / admin only.
 */
export async function finalizeScorecard(employeeId: string): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!Uuid.safeParse(employeeId).success) return { ok: false, error: "Invalid id" };

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const cfg = await loadConfig(employeeId);
  if (!canManage(g.me, cfg)) return { ok: false, error: "Only management can finalize the scorecard." };

  const id = await upsertScorecard(
    employeeId,
    { status: "finalized", finalizedAt: new Date() },
    g.me.id,
  );

  await composeAppraisalLetter(employeeId);

  revalidatePath("/appraisal");
  return { ok: true, id };
}
