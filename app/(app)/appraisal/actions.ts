"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  employees,
  appraisalCycles,
  appraisalConfig,
  appraisalItems,
  appraisalScores,
  appraisalAttachments,
  appraisalCultureAssignments,
} from "@/lib/db";
import { pmsConstitutionPara } from "@/lib/pms/v3/schema";
import { requireUser } from "@/lib/auth/current";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";
import { emit, newCorrelationId } from "@/lib/events/emit";
import {
  appraisalCycleOpened,
  appraisalCycleFinalized,
  appraisalConfigUpdated,
  appraisalKpiApproved,
  appraisalSelfSubmitted,
  appraisalManagerSubmitted,
  appraisalManagementSubmitted,
  appraisalItemFinalized,
  appraisalCultureAssigned,
} from "@/lib/events/appraisal-events";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import {
  isAppraisalAdmin,
  canViewAppraisal,
  canManagerScore,
  isManagerEmployee,
} from "@/lib/pms/appraisal/access";
import { loadAppraisalConfig } from "@/lib/pms/appraisal/config";
import { computeKnowledgeSharing } from "@/lib/pms/appraisal/training";
import { computeScorecard } from "@/lib/pms/appraisal/engine";
import type { EngineItem } from "@/lib/pms/appraisal/engine";
import {
  APPRAISAL_CYCLE_STATUSES,
  type AppraisalCycleStatus,
  type AppraisalDimension,
} from "@/db/enums";
import type { Employee } from "@/db/schema";

type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const uuid = z.string().uuid();
const scoreSchema = z.coerce.number().min(0).max(10);

async function superAdminIds(): Promise<string[]> {
  const emails = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase());
  const rows = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));
  return rows
    .filter((r) => r.email && emails.includes(r.email.trim().toLowerCase()))
    .map((r) => r.id);
}

/* ───────────────────────── Admin: config ───────────────────────── */

const ConfigSchema = z.object({
  dimensionWeights: z.record(z.string(), z.coerce.number().min(0).max(100)),
  ratingTerms: z.array(
    z.object({ min: z.coerce.number().min(0).max(100), label: z.string().trim().min(1).max(60) }),
  ),
  incentiveTargetPct: z.coerce.number().min(0.01).max(1000),
  knowledgeSharingRule: z.object({
    do: z.coerce.number().min(0).max(1000),
    give: z.coerce.number().min(0).max(1000),
  }),
  culturePerMonth: z.coerce.number().int().min(1).max(12),
});

export async function saveAppraisalConfig(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const cfg = parsed.data;

  // Dimension weights must total 100% (the engine renormalises, but the config
  // is the source of truth and must be internally consistent).
  const weightSum = Object.values(cfg.dimensionWeights).reduce((s, v) => s + (Number(v) || 0), 0);
  if (Math.round(weightSum) !== 100) {
    return { ok: false, error: `Dimension weights must total 100% (got ${Math.round(weightSum)}%).` };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(appraisalConfig)
      .values({
        id: "default",
        dimensionWeights: cfg.dimensionWeights as Partial<Record<AppraisalDimension, number>>,
        ratingTerms: [...cfg.ratingTerms].sort((a, b) => b.min - a.min),
        incentiveTargetPct: String(cfg.incentiveTargetPct),
        knowledgeSharingRule: cfg.knowledgeSharingRule,
        culturePerMonth: cfg.culturePerMonth,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appraisalConfig.id,
        set: {
          dimensionWeights: cfg.dimensionWeights as Partial<Record<AppraisalDimension, number>>,
          ratingTerms: [...cfg.ratingTerms].sort((a, b) => b.min - a.min),
          incentiveTargetPct: String(cfg.incentiveTargetPct),
          knowledgeSharingRule: cfg.knowledgeSharingRule,
          culturePerMonth: cfg.culturePerMonth,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });
    await emit(
      tx,
      appraisalConfigUpdated({ period: "config" }, { actorId: me.id }),
    );
  });

  revalidatePath("/appraisal/config");
  revalidatePath("/appraisal");
  return { ok: true };
}

/* ───────────────────────── Admin: cycles ───────────────────────── */

const CycleSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
  label: z.string().trim().max(120).optional(),
});

export async function createCycle(input: unknown): Promise<Result<{ id: string }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const exists = await db
    .select({ id: appraisalCycles.id })
    .from(appraisalCycles)
    .where(eq(appraisalCycles.period, parsed.data.period))
    .limit(1);
  if (exists.length > 0) return { ok: false, error: "A cycle for that month already exists." };

  const [row] = await db
    .insert(appraisalCycles)
    .values({
      period: parsed.data.period,
      label: parsed.data.label || null,
      status: "draft",
      createdById: me.id,
    })
    .returning({ id: appraisalCycles.id });

  revalidatePath("/appraisal");
  return { ok: true, id: row!.id };
}

export async function setCycleStatus(
  cycleId: string,
  status: AppraisalCycleStatus,
): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!uuid.safeParse(cycleId).success) return { ok: false, error: "Bad cycle." };
  if (!APPRAISAL_CYCLE_STATUSES.includes(status)) return { ok: false, error: "Bad status." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [cycle] = await db
    .select()
    .from(appraisalCycles)
    .where(eq(appraisalCycles.id, cycleId))
    .limit(1);
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const correlationId = newCorrelationId();
  await db.transaction(async (tx) => {
    await tx
      .update(appraisalCycles)
      .set({ status, updatedAt: new Date() })
      .where(eq(appraisalCycles.id, cycleId));

    if (status === "open") {
      // Publish hand-scored draft items → awaiting_self.
      await tx
        .update(appraisalItems)
        .set({ status: "awaiting_self", updatedAt: new Date() })
        .where(
          and(
            eq(appraisalItems.cycleId, cycleId),
            eq(appraisalItems.status, "draft"),
            eq(appraisalItems.isAuto, false),
          ),
        );
      await emit(
        tx,
        appraisalCycleOpened(cycleId, { period: cycle.period }, { actorId: me.id, correlationId }),
      );
    }

    if (status === "finalized") {
      await emit(
        tx,
        appraisalCycleFinalized(cycleId, { period: cycle.period }, { actorId: me.id, correlationId }),
      );
    }
  });

  // Fan-out notifications off the write path (best-effort).
  if (status === "open") {
    const recipients = await db
      .selectDistinct({ employeeId: appraisalItems.employeeId })
      .from(appraisalItems)
      .where(eq(appraisalItems.cycleId, cycleId));
    for (const r of recipients) {
      await notify({
        userId: r.employeeId,
        kind: "appraisal_cycle_opened",
        title: `Your ${cycle.label || cycle.period} appraisal is open`,
        body: "Self-scoring is now open. Add your scores and justifications.",
        actorId: me.id,
      });
    }
  }
  if (status === "finalized") {
    await finalizeAllForCycle(cycleId, me.id);
    const recipients = await db
      .selectDistinct({ employeeId: appraisalItems.employeeId })
      .from(appraisalItems)
      .where(eq(appraisalItems.cycleId, cycleId));
    for (const r of recipients) {
      await notify({
        userId: r.employeeId,
        kind: "appraisal_finalized",
        title: `Your ${cycle.label || cycle.period} appraisal is final`,
        body: "Your final scores have been locked. Open Appraisal to view them.",
        actorId: me.id,
      });
    }
  }

  revalidatePath("/appraisal");
  return { ok: true };
}

/** Compute + persist final maxScore/finalScore for every item in a cycle. */
async function finalizeAllForCycle(cycleId: string, actorId: string): Promise<void> {
  const config = await loadAppraisalConfig();
  const rows = await db
    .select({ item: appraisalItems, score: appraisalScores })
    .from(appraisalItems)
    .leftJoin(appraisalScores, eq(appraisalScores.itemId, appraisalItems.id))
    .where(eq(appraisalItems.cycleId, cycleId));

  const byEmp = new Map<string, { item: typeof appraisalItems.$inferSelect; score: typeof appraisalScores.$inferSelect | null }[]>();
  for (const r of rows) {
    const arr = byEmp.get(r.item.employeeId) ?? [];
    arr.push(r);
    byEmp.set(r.item.employeeId, arr);
  }

  for (const [employeeId, recs] of byEmp) {
    const isManager = await isManagerEmployee(employeeId);
    const engineItems: EngineItem[] = recs.map((r) => toEngineItem(r.item, r.score));
    const card = computeScorecard(engineItems, config, isManager);
    const pointsByItem = new Map<string, { max: number; earned: number }>();
    for (const dim of card.dimensions) {
      for (const it of dim.items) {
        pointsByItem.set(it.id, { max: it.maxPoints, earned: it.earnedPoints });
      }
    }
    for (const r of recs) {
      const pts = pointsByItem.get(r.item.id) ?? { max: 0, earned: 0 };
      await db.transaction(async (tx) => {
        await tx
          .insert(appraisalScores)
          .values({
            itemId: r.item.id,
            maxScore: pts.max.toFixed(2),
            finalScore: pts.earned.toFixed(2),
            finalizedById: actorId,
            finalizedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appraisalScores.itemId,
            set: {
              maxScore: pts.max.toFixed(2),
              finalScore: pts.earned.toFixed(2),
              finalizedById: actorId,
              finalizedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        await tx
          .update(appraisalItems)
          .set({ status: "finalized", updatedAt: new Date() })
          .where(eq(appraisalItems.id, r.item.id));
      });
    }
  }
}

function toEngineItem(
  it: typeof appraisalItems.$inferSelect,
  sc: typeof appraisalScores.$inferSelect | null,
): EngineItem {
  return {
    id: it.id,
    dimension: it.dimension,
    sortOrder: it.sortOrder,
    area: it.area,
    title: it.title,
    measure: it.measure,
    subWeight: it.subWeight,
    isTechnical: it.isTechnical,
    isManagerOnly: it.isManagerOnly,
    isAuto: it.isAuto,
    status: it.status,
    actualValue: it.actualValue,
    evidence: it.evidence,
    adminApproved: it.adminApproved,
    adminRemarks: it.adminRemarks,
    meta: (it.meta ?? {}) as Record<string, unknown>,
    score: sc
      ? {
          selfScore: sc.selfScore,
          selfJustification: sc.selfJustification,
          selfSubmittedAt: sc.selfSubmittedAt,
          managerScore: sc.managerScore,
          managerExplanation: sc.managerExplanation,
          managerSubmittedAt: sc.managerSubmittedAt,
          managementScore: sc.managementScore,
          managementExplanation: sc.managementExplanation,
          managementSubmittedAt: sc.managementSubmittedAt,
          maxScore: sc.maxScore,
          finalScore: sc.finalScore,
          finalizedAt: sc.finalizedAt,
        }
      : null,
  };
}

/* ───────────────────── Admin: build items ───────────────────── */

const AUTO_DIMS = new Set<AppraisalDimension>(["incentive", "knowledge_sharing"]);
const MANAGER_ONLY = new Set<AppraisalDimension>([
  "problem_solving",
  "growth_mindset",
  "ability",
]);
const CAPPED_DIMS: Partial<Record<AppraisalDimension, number>> = { skill: 3, attitude: 3 };

const AddItemSchema = z.object({
  cycleId: uuid,
  employeeId: uuid,
  dimension: z.enum([
    "kpi",
    "skill",
    "attitude",
    "incentive",
    "culture",
    "knowledge_sharing",
    "problem_solving",
    "growth_mindset",
    "ability",
  ]),
  title: z.string().trim().min(1).max(300),
  area: z.string().trim().max(200).optional(),
  measure: z.string().trim().max(200).optional(),
  subWeight: z.coerce.number().min(0).max(100).optional(),
  isTechnical: z.boolean().optional(),
});

export async function addItem(input: unknown): Promise<Result<{ id: string }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  const dim = d.dimension as AppraisalDimension;

  const cap = CAPPED_DIMS[dim];
  if (cap != null) {
    const countRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(appraisalItems)
      .where(
        and(
          eq(appraisalItems.cycleId, d.cycleId),
          eq(appraisalItems.employeeId, d.employeeId),
          eq(appraisalItems.dimension, dim),
        ),
      );
    if ((countRows[0]?.n ?? 0) >= cap) {
      return { ok: false, error: `Only ${cap} ${dim} items are allowed.` };
    }
  }

  const sortRows = await db
    .select({ maxSort: sql<number>`coalesce(max(${appraisalItems.sortOrder}), 0)::int` })
    .from(appraisalItems)
    .where(
      and(
        eq(appraisalItems.cycleId, d.cycleId),
        eq(appraisalItems.employeeId, d.employeeId),
        eq(appraisalItems.dimension, dim),
      ),
    );
  const maxSort = sortRows[0]?.maxSort ?? 0;

  const [row] = await db
    .insert(appraisalItems)
    .values({
      cycleId: d.cycleId,
      employeeId: d.employeeId,
      dimension: dim,
      sortOrder: maxSort + 1,
      title: d.title,
      area: d.area || null,
      measure: d.measure || null,
      subWeight: String(d.subWeight ?? 0),
      isTechnical: dim === "skill" ? d.isTechnical ?? false : null,
      isManagerOnly: MANAGER_ONLY.has(dim),
      isAuto: AUTO_DIMS.has(dim),
      status: "draft",
      createdById: me.id,
    })
    .returning({ id: appraisalItems.id });

  revalidatePath(`/appraisal/${d.employeeId}`);
  return { ok: true, id: row!.id };
}

const UpdateItemSchema = z.object({
  itemId: uuid,
  title: z.string().trim().min(1).max(300).optional(),
  area: z.string().trim().max(200).nullable().optional(),
  measure: z.string().trim().max(200).nullable().optional(),
  subWeight: z.coerce.number().min(0).max(100).optional(),
  actualValue: z.string().trim().max(500).nullable().optional(),
  evidence: z.string().trim().max(1000).nullable().optional(),
  isTechnical: z.boolean().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function updateItem(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;

  const [item] = await db
    .select()
    .from(appraisalItems)
    .where(eq(appraisalItems.id, d.itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  const set: Partial<typeof appraisalItems.$inferInsert> = { updatedAt: new Date() };
  if (d.title !== undefined) set.title = d.title;
  if (d.area !== undefined) set.area = d.area;
  if (d.measure !== undefined) set.measure = d.measure;
  if (d.subWeight !== undefined) set.subWeight = String(d.subWeight);
  if (d.actualValue !== undefined) set.actualValue = d.actualValue;
  if (d.evidence !== undefined) set.evidence = d.evidence;
  if (d.isTechnical !== undefined && item.dimension === "skill") set.isTechnical = d.isTechnical;
  if (d.meta !== undefined) {
    set.meta = { ...(item.meta ?? {}), ...d.meta } as Record<string, unknown>;
  }

  await db.update(appraisalItems).set(set).where(eq(appraisalItems.id, d.itemId));
  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Bad item." };

  const [item] = await db
    .select({ employeeId: appraisalItems.employeeId })
    .from(appraisalItems)
    .where(eq(appraisalItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  await db.delete(appraisalItems).where(eq(appraisalItems.id, itemId));
  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

/** KPI approval (admin objective scoring). Writes the admin verdict + a
 *  management-stage score (0..10) so the engine picks it up as authoritative. */
const ApproveKpiSchema = z.object({
  itemId: uuid,
  approved: z.boolean(),
  remarks: z.string().trim().max(1000).optional(),
  score: scoreSchema.optional(),
});

export async function approveKpi(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ApproveKpiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  if (!d.approved && !d.remarks) return { ok: false, error: "Remarks are required when not approved." };

  const [item] = await db
    .select()
    .from(appraisalItems)
    .where(eq(appraisalItems.id, d.itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(appraisalItems)
      .set({
        adminApproved: d.approved,
        adminRemarks: d.remarks || null,
        status: d.approved ? "awaiting_self" : "draft",
        updatedAt: new Date(),
      })
      .where(eq(appraisalItems.id, d.itemId));

    if (d.approved && d.score !== undefined) {
      await tx
        .insert(appraisalScores)
        .values({
          itemId: d.itemId,
          managementId: me.id,
          managementScore: String(d.score),
          managementExplanation: d.remarks || null,
          managementSubmittedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appraisalScores.itemId,
          set: {
            managementId: me.id,
            managementScore: String(d.score),
            managementExplanation: d.remarks || null,
            managementSubmittedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
    await emit(
      tx,
      appraisalKpiApproved(
        d.itemId,
        { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: "kpi", approved: d.approved },
        { actorId: me.id },
      ),
    );
  });

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

/* ───────────────────── Scoring: self → manager → management ───────────────────── */

async function loadItemForScoring(itemId: string): Promise<
  | { ok: true; item: typeof appraisalItems.$inferSelect }
  | { ok: false; error: string }
> {
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Bad item." };
  const [item] = await db
    .select()
    .from(appraisalItems)
    .where(eq(appraisalItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.isAuto) return { ok: false, error: "This item is scored automatically." };
  return { ok: true, item };
}

async function upsertScore(
  itemId: string,
  patch: Partial<typeof appraisalScores.$inferInsert>,
): Promise<void> {
  await db
    .insert(appraisalScores)
    .values({ itemId, ...patch })
    .onConflictDoUpdate({
      target: appraisalScores.itemId,
      set: { ...patch, updatedAt: new Date() },
    });
}

const SelfSchema = z.object({
  itemId: uuid,
  score: scoreSchema,
  justification: z.string().trim().max(2000).optional(),
});

export async function submitSelfScore(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SelfSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;

  const loaded = await loadItemForScoring(d.itemId);
  if (!loaded.ok) return loaded;
  const { item } = loaded;
  if (item.employeeId !== me.id && !isAppraisalAdmin(me)) {
    return { ok: false, error: "You can only self-score your own items." };
  }
  if (item.isManagerOnly) return { ok: false, error: "This item is scored by your manager." };

  await db.transaction(async (tx) => {
    await tx
      .insert(appraisalScores)
      .values({
        itemId: d.itemId,
        selfScore: String(d.score),
        selfJustification: d.justification || null,
        selfSubmittedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appraisalScores.itemId,
        set: {
          selfScore: String(d.score),
          selfJustification: d.justification || null,
          selfSubmittedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    await tx
      .update(appraisalItems)
      .set({ status: "awaiting_manager", updatedAt: new Date() })
      .where(eq(appraisalItems.id, d.itemId));
    await emit(
      tx,
      appraisalSelfSubmitted(
        d.itemId,
        { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "self", score: d.score },
        { actorId: me.id },
      ),
    );
  });

  // Notify the manager a self score landed.
  const [emp] = await db
    .select({ managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.id, item.employeeId))
    .limit(1);
  if (emp?.managerId) {
    await notify({
      userId: emp.managerId,
      kind: "appraisal_manager_pending",
      title: "A self score is ready for your review",
      body: "A team member submitted a self score. Add your manager score + explanation.",
      actorId: me.id,
    });
  }

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

const ManagerSchema = z.object({
  itemId: uuid,
  score: scoreSchema,
  explanation: z.string().trim().min(1, "Manager explanation is required.").max(2000),
});

export async function submitManagerScore(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ManagerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;

  const loaded = await loadItemForScoring(d.itemId);
  if (!loaded.ok) return loaded;
  const { item } = loaded;
  if (!(await canManagerScore(me, item.employeeId))) {
    return { ok: false, error: "You are not this person's manager." };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(appraisalScores)
      .values({
        itemId: d.itemId,
        managerId: me.id,
        managerScore: String(d.score),
        managerExplanation: d.explanation,
        managerSubmittedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appraisalScores.itemId,
        set: {
          managerId: me.id,
          managerScore: String(d.score),
          managerExplanation: d.explanation,
          managerSubmittedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    await tx
      .update(appraisalItems)
      .set({ status: "awaiting_management", updatedAt: new Date() })
      .where(eq(appraisalItems.id, d.itemId));
    await emit(
      tx,
      appraisalManagerSubmitted(
        d.itemId,
        { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "manager", score: d.score },
        { actorId: me.id },
      ),
    );
  });

  for (const id of await superAdminIds()) {
    await notify({
      userId: id,
      kind: "appraisal_management_pending",
      title: "A manager score is ready for management review",
      body: "A manager submitted a score. Add the management score to finalize.",
      actorId: me.id,
    });
  }

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

const ManagementSchema = z.object({
  itemId: uuid,
  score: scoreSchema,
  explanation: z.string().trim().max(2000).optional(),
});

export async function submitManagementScore(input: unknown): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ManagementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const d = parsed.data;

  const loaded = await loadItemForScoring(d.itemId);
  if (!loaded.ok) return loaded;
  const { item } = loaded;

  await db.transaction(async (tx) => {
    await tx
      .insert(appraisalScores)
      .values({
        itemId: d.itemId,
        managementId: me.id,
        managementScore: String(d.score),
        managementExplanation: d.explanation || null,
        managementSubmittedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appraisalScores.itemId,
        set: {
          managementId: me.id,
          managementScore: String(d.score),
          managementExplanation: d.explanation || null,
          managementSubmittedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    await tx
      .update(appraisalItems)
      .set({ status: "finalized", updatedAt: new Date() })
      .where(eq(appraisalItems.id, d.itemId));
    await emit(
      tx,
      appraisalManagementSubmitted(
        d.itemId,
        { period: "", employeeId: item.employeeId, itemId: d.itemId, dimension: item.dimension, stage: "management", score: d.score },
        { actorId: me.id },
      ),
    );
  });

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true };
}

/* ───────────────────── Culture: auto-assign 3/month serial-wise ───────────────────── */

export async function assignCultureForPeriod(period: string): Promise<Result<{ count: number }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Period must be YYYY-MM." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const config = await loadAppraisalConfig();
  const n = config.culturePerMonth;

  // Already assigned? Idempotent — return the existing count.
  const existing = await db
    .select({ id: appraisalCultureAssignments.id })
    .from(appraisalCultureAssignments)
    .where(eq(appraisalCultureAssignments.period, period));
  if (existing.length > 0) return { ok: true, count: existing.length };

  const pool = await db
    .select({ id: pmsConstitutionPara.id })
    .from(pmsConstitutionPara)
    .where(and(eq(pmsConstitutionPara.active, true), eq(pmsConstitutionPara.isHeading, false)))
    .orderBy(pmsConstitutionPara.position);
  if (pool.length === 0) return { ok: false, error: "No active Constitution items to assign." };

  // Serial pointer = how many have been assigned across all prior months.
  const usedRows = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(appraisalCultureAssignments);
  const used = usedRows[0]?.used ?? 0;

  const picks: { paraId: string; serial: number }[] = [];
  for (let k = 0; k < n; k++) {
    const para = pool[(used + k) % pool.length]!;
    picks.push({ paraId: para.id, serial: k + 1 });
  }

  await db.transaction(async (tx) => {
    await tx.insert(appraisalCultureAssignments).values(
      picks.map((p) => ({ period, paraId: p.paraId, serial: p.serial, createdById: me.id })),
    );
    await emit(
      tx,
      appraisalCultureAssigned(
        { period, paraIds: picks.map((p) => p.paraId) },
        { actorId: me.id },
      ),
    );
  });

  revalidatePath("/appraisal");
  return { ok: true, count: picks.length };
}

/** View/reorder the Culture pool — move a Constitution paragraph up/down in the
 *  serial rotation. Swaps its `position` with the adjacent NON-heading, active
 *  pool member so the culture rotation order changes without disturbing the
 *  document's headings. (Reuses the /pms/v3 pms_constitution_para table — the
 *  same order the constitution reads in, by design.) */
export async function reorderCulturePool(
  paraId: string,
  direction: "up" | "down",
): Promise<Result> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!uuid.safeParse(paraId).success) return { ok: false, error: "Bad id." };
  if (direction !== "up" && direction !== "down") return { ok: false, error: "Bad direction." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const pool = await db
    .select({ id: pmsConstitutionPara.id, position: pmsConstitutionPara.position })
    .from(pmsConstitutionPara)
    .where(and(eq(pmsConstitutionPara.active, true), eq(pmsConstitutionPara.isHeading, false)))
    .orderBy(pmsConstitutionPara.position);

  const idx = pool.findIndex((p) => p.id === paraId);
  if (idx < 0) return { ok: false, error: "Not in the active pool." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= pool.length) return { ok: true }; // already at an edge — no-op

  const a = pool[idx]!;
  const b = pool[swapIdx]!;
  await db.transaction(async (tx) => {
    await tx.update(pmsConstitutionPara).set({ position: b.position }).where(eq(pmsConstitutionPara.id, a.id));
    await tx.update(pmsConstitutionPara).set({ position: a.position }).where(eq(pmsConstitutionPara.id, b.id));
  });

  revalidatePath("/appraisal/culture");
  return { ok: true };
}

/** Auto-fill a knowledge_sharing item's counts from the Training Centre for the
 *  item's cycle month (do = attended, give = delivered). Idempotent; admin-only.
 *  Keeps existing manual meta when Training has nothing (wired=false). */
export async function refreshKnowledgeSharing(itemId: string): Promise<Result<{ done: number; given: number; wired: boolean }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Bad item." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [item] = await db
    .select({
      id: appraisalItems.id,
      employeeId: appraisalItems.employeeId,
      dimension: appraisalItems.dimension,
      meta: appraisalItems.meta,
      cycleId: appraisalItems.cycleId,
    })
    .from(appraisalItems)
    .where(eq(appraisalItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.dimension !== "knowledge_sharing") {
    return { ok: false, error: "Not a Knowledge Sharing item." };
  }

  const [cycle] = await db
    .select({ period: appraisalCycles.period })
    .from(appraisalCycles)
    .where(eq(appraisalCycles.id, item.cycleId))
    .limit(1);
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const counts = await computeKnowledgeSharing(item.employeeId, cycle.period);
  if (!counts.wired) {
    return { ok: false, error: "No training sessions found for this month — enter counts manually." };
  }

  await db
    .update(appraisalItems)
    .set({
      meta: { ...(item.meta ?? {}), done: counts.done, given: counts.given },
      updatedAt: new Date(),
    })
    .where(eq(appraisalItems.id, itemId));

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true, done: counts.done, given: counts.given, wired: counts.wired };
}

/* ───────────────────── Seed the auto / culture / manager-only lines ───────────────────── */

/** Create the standard non-KPI dimension lines for an employee in a cycle:
 *  incentive + knowledge_sharing (auto), culture (this month's trio), and the
 *  three manager-only one-liners (only when the person is a manager). */
export async function seedEmployeeDimensions(
  cycleId: string,
  employeeId: string,
): Promise<Result<{ created: number }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!uuid.safeParse(cycleId).success || !uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Bad ids." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [cycle] = await db
    .select()
    .from(appraisalCycles)
    .where(eq(appraisalCycles.id, cycleId))
    .limit(1);
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const config = await loadAppraisalConfig();
  const existing = await db
    .select({ dimension: appraisalItems.dimension })
    .from(appraisalItems)
    .where(
      and(eq(appraisalItems.cycleId, cycleId), eq(appraisalItems.employeeId, employeeId)),
    );
  const have = new Set(existing.map((e) => e.dimension));

  const isManager = await isManagerEmployee(employeeId);
  const culture = await db
    .select({ paraId: appraisalCultureAssignments.paraId, serial: appraisalCultureAssignments.serial })
    .from(appraisalCultureAssignments)
    .where(eq(appraisalCultureAssignments.period, cycle.period))
    .orderBy(appraisalCultureAssignments.serial);

  const toCreate: (typeof appraisalItems.$inferInsert)[] = [];
  const add = (dim: AppraisalDimension, title: string, extra: Partial<typeof appraisalItems.$inferInsert> = {}) => {
    if (have.has(dim)) return;
    toCreate.push({
      cycleId,
      employeeId,
      dimension: dim,
      title,
      subWeight: "100",
      isManagerOnly: MANAGER_ONLY.has(dim),
      isAuto: AUTO_DIMS.has(dim),
      status: "draft",
      createdById: me.id,
      ...extra,
    });
  };

  // Knowledge Sharing auto-seeds from the Training Centre for the cycle month;
  // falls back to zeros (hand-editable) when Training has nothing.
  const ks = await computeKnowledgeSharing(employeeId, cycle.period);

  add("incentive", "Incentive performance", {
    meta: { targetPct: config.incentiveTargetPct, baseSalary: 0, earned: 0 },
  });
  add("knowledge_sharing", "Knowledge sharing (Training)", {
    meta: { done: ks.done, given: ks.given },
  });
  if (culture.length > 0) {
    add("culture", "Altus Corp Constitution (this month)", {
      meta: {
        paraIds: culture.map((c) => c.paraId),
        serials: culture.map((c) => c.serial),
      },
    });
  }
  if (isManager) {
    add("problem_solving", "Problem-solving ability (Yes/No)");
    add("growth_mindset", "Growth mindset (Yes/No)");
    add("ability", "Ability to get things done (Yes/No)");
  }

  if (toCreate.length === 0) return { ok: true, created: 0 };
  await db.insert(appraisalItems).values(toCreate);

  revalidatePath(`/appraisal/${employeeId}`);
  return { ok: true, created: toCreate.length };
}

/* ───────────────────── Attachment upload (dossier pattern) ───────────────────── */

const MAX_BYTES = 25 * 1024 * 1024;
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export async function uploadItemAttachment(form: FormData): Promise<Result<{ id: string }>> {
  requireAppraisal();
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const itemId = String(form.get("itemId") ?? "");
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Bad item." };
  const stage = String(form.get("stage") ?? "self");

  const [item] = await db
    .select()
    .from(appraisalItems)
    .where(eq(appraisalItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };
  // Self may attach to their own; managers/admins to their scope.
  const allowed =
    item.employeeId === me.id ||
    isAppraisalAdmin(me) ||
    (await canManagerScore(me, item.employeeId));
  if (!allowed) return { ok: false, error: "Forbidden" };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  if (DISALLOWED_EXTENSIONS.test(file.name)) return { ok: false, error: "This file type is not allowed." };

  const path = `appraisal/${item.employeeId}/${itemId}/${Date.now()}-${safeName(file.name)}`;
  const supa = getSupabaseAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supa.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, error: "Upload failed." };

  const [row] = await db
    .insert(appraisalAttachments)
    .values({
      itemId,
      stage: stage === "manager" || stage === "management" ? stage : "self",
      uploadedById: me.id,
      storagePath: path,
      fileName: file.name.slice(0, 200),
      mimeType: file.type || null,
      sizeBytes: file.size,
    })
    .returning({ id: appraisalAttachments.id });

  revalidatePath(`/appraisal/${item.employeeId}`);
  return { ok: true, id: row!.id };
}

/** A short-lived signed URL for an attachment (viewer must have view rights). */
export async function signAttachmentUrl(attachmentId: string): Promise<Result<{ url: string }>> {
  requireAppraisal();
  const me = await requireUser();
  if (!uuid.safeParse(attachmentId).success) return { ok: false, error: "Bad id." };

  const [row] = await db
    .select({ storagePath: appraisalAttachments.storagePath, itemId: appraisalAttachments.itemId })
    .from(appraisalAttachments)
    .where(eq(appraisalAttachments.id, attachmentId))
    .limit(1);
  if (!row) return { ok: false, error: "Not found." };

  const [item] = await db
    .select({ employeeId: appraisalItems.employeeId })
    .from(appraisalItems)
    .where(eq(appraisalItems.id, row.itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Not found." };
  if (!(await canViewAppraisal(me as Employee, item.employeeId))) {
    return { ok: false, error: "Forbidden" };
  }

  const supa = getSupabaseAdmin();
  const { data, error } = await supa.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(row.storagePath, 300);
  if (error || !data) return { ok: false, error: "Could not sign URL." };
  return { ok: true, url: data.signedUrl };
}
