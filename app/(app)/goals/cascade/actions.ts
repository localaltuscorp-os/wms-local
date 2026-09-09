"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, weeklyGoals, dailyChecklist, goalLookups } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { listGoalLookups, goalLookupExists, isBaseGoalLookup, type GoalLookupOptions } from "@/lib/goals/lookups";
import { goalsSpace } from "@/lib/goals/space";
import { autoPctDone, statusForPct } from "@/lib/goals/auto-pct";
import { bucketWeightSum, WEIGHT_CAP } from "@/lib/goals/weight";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadWritableGoalRow,
  goalScopeFor,
  canManageGoalFor,
  goalPolicyFor,
} from "@/lib/goals/scope";
import { POLICY_REASONS, type GoalPolicy } from "@/lib/goals/policy";
import { goalsCanvasOn } from "@/lib/goals/flag";
import { setAdopted, generateChildren } from "@/lib/goals/cascade";
import { logGoalActivity } from "@/lib/goals/activity";
import { GoalEventTypes } from "@/lib/events/types";
import { notify } from "@/lib/notifications/dispatch";
import { afterResponse } from "@/lib/after";
import { cloneForward, moveTo } from "@/lib/goals/carry";
import { mondayOf } from "@/lib/weekly-goals/week";
import { quarterKeyOfMonthKey, fyStartYearOfMonthKey, fyStartYearOfKey, quartersOfFy, monthKeysOfQuarter } from "@/lib/goals/types";
import { GOAL_PERIODS, TASK_STATUSES, GOAL_TYPES } from "@/db/enums";
import { toGoalDTO, type GoalDTO, type RosterMember } from "@/components/goals/cascade/util";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  listMonthlyMasterPickables,
  type MonthlyMasterPickable,
} from "@/lib/queries/monthly-events";

/* ------------------------------------------------------------------ */
/* Result shape + shared helpers                                       */
/* ------------------------------------------------------------------ */

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

/**
 * Phase-1 optimistic-mutation spine (design §3.4): single-row mutations RETURN
 * the mutated/created row as a serialisable `GoalDTO` so the canvas client can
 * reconcile its `useOptimistic` tree with server truth instead of a full
 * `router.refresh()` round-trip. The `revalidateGoals` calls are KEPT — the
 * production CascadeWorkspace (flag OFF) still relies on path revalidation, and
 * for the canvas it refreshes the base RSC payload the optimistic layer resets
 * onto. (The deliberate no-`revalidatePath` rule applies only to the plan/daily
 * surface — see app/(app)/goals/plan/actions.ts.)
 */
type WeeklyRow = typeof weeklyGoals.$inferSelect;

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateGoals(...periodKeys: (string | null | undefined)[]) {
  revalidatePath("/goals/cascade");
  revalidatePath("/goals/review");
  revalidatePath("/review"); // the WMS-owned alias of the same workbench
  // The 5-page restructure level routes — without these the overlay-reset
  // contract never fires in-session on the level pages (bug #17).
  revalidatePath("/goals/yearly"); // yearly rootView shares the same canvas payload
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/week");
  for (const k of periodKeys) if (k) revalidatePath(`/goals/cascade/${k}`);
}

/**
 * Phase 2 (Option A policy) — resolve the caller's policy over a goal OWNER,
 * but only ENFORCE while the canvas flag is on: these actions are shared with
 * the flag-OFF production CascadeWorkspace, whose long-standing owner
 * permissions must stay byte-identical until the flag flips (hard law).
 * Returns null when enforcement is off (allow everything loadWritableGoalRow
 * already allowed).
 */
async function policyGate(
  me: { id: string; isAdmin: boolean },
  ownerEmployeeId: string,
): Promise<GoalPolicy | null> {
  if (!goalsCanvasOn()) return null;
  return goalPolicyFor(me, ownerEmployeeId);
}

/** numeric(14,2) inputs arrive as number | string | "" — normalise to a 2-dp
 *  string or null so drizzle writes the money columns cleanly. */
function money(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Next Sr. No. within an (employee, period, key) bucket. */
async function nextGoalPosition(
  employeeId: string,
  period: string,
  periodKey: string,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${goals.position}), 0)::int` })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.period, period),
        eq(goals.periodKey, periodKey),
      ),
    );
  return (row?.max ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Validators (Zod v4)                                                 */
/* ------------------------------------------------------------------ */

const MoneyIn = z.union([z.number(), z.string()]).nullish();
const TeamIn = z
  .array(
    z.object({
      employeeId: z.string().optional(),
      name: z.string().optional(),
      // Per-member weight (share of the goal). Optional; 0..1000.
      weight: z.number().int().min(0).max(1000).optional(),
    }),
  )
  .max(40)
  .nullish();

// "Delegate to team" (mig 0171) — accountability hand-off. Each delegate is a
// real employee (employeeId required, unlike TeamIn's free-text members) with a
// delegation percentage (default 100). null/[] clears delegation.
const DelegateIn = z
  .array(
    z.object({
      employeeId: z.string().uuid(),
      name: z.string().max(120).optional(),
      pct: z.number().int().min(0).max(100),
    }),
  )
  .max(40)
  .nullish();

/** #7 — a goal carrying real (employeeId-bearing) team members is auto-shared
 *  onto those members' boards. `getSharedGoals` gates on share_with_team, so the
 *  moment a member is added the goal must flip shareWithTeam=true to appear. */
function hasTeamMembers(team: unknown): boolean {
  return (
    Array.isArray(team) &&
    team.some(
      (m) => m && typeof m === "object" && typeof (m as { employeeId?: unknown }).employeeId === "string",
    )
  );
}

// Type/category is now an admin-extensible free-text value (mig 0148 lookups):
// base types (Goal/Target/Milestone/Operational) + any admin-added ones.
const CATEGORY = z.string().trim().min(1).max(60);
const INCENTIVE_KIND = z.enum(["one_time", "repetitive", "milestone"]);
/** Target date (deadline) — ISO 'YYYY-MM-DD', "" / null to clear. Stays OPTIONAL
 *  (undefined = "not provided") so editGoal never clobbers it on an unrelated edit;
 *  "" is normalised to null at persist time. */
const TargetDateIn = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"), z.literal(""), z.null()])
  .optional();
/** The picked Monthly-Master item snapshot ({kind,id,label}) or null to clear. */
const MonthlyMasterRefIn = z
  .object({
    kind: z.string().max(40),
    id: z.string().uuid(),
    label: z.string().max(300),
  })
  .nullish();

const GoalFields = {
  area: z.string().max(160).nullish(),
  title: z.string().min(1, "Goal is required").max(400),
  category: CATEGORY.optional(),
  // Goal Type taxonomy — the inline board Type selector edits THIS; supersedes
  // free-text `category`. Stores a canonical CODE for the built-in types
  // (kpi/strategic/operational/essential) OR the raw label of an admin-added
  // custom type (#194 — super-admins add/delete Goal Types like Area/Measure),
  // so we validate a bounded string rather than the fixed enum.
  goalType: z.string().trim().min(1).max(60).nullish(),
  uom: z.string().max(80).nullish(),
  targetQty: MoneyIn,
  targetAmount: MoneyIn,
  actualQty: MoneyIn,
  actualAmount: MoneyIn,
  notes: z.string().max(4000).nullish(),
  teamInvolved: TeamIn,
  teamDependencyPct: z.number().int().min(0).max(100).nullish(),
  shareWithTeam: z.boolean().optional(),
  delegatedTo: DelegateIn,
  weight: z.number().int().min(0).max(1000).optional(),
  incentiveEnabled: z.boolean().optional(),
  incentiveAmount: MoneyIn,
  incentiveKind: INCENTIVE_KIND.nullish(),
  monthlyMasterRef: MonthlyMasterRefIn,
  targetDate: TargetDateIn,
  // Inline Status editor — a real goals.status column (reuses the app-wide Task
  // status enum). OPTIONAL so editGoal never clobbers it on an unrelated edit.
  status: z.enum(TASK_STATUSES).optional(),
  // Inline Reviewer editor — writes goals.reviewed_by_id (the designated
  // reviewer). null clears it. OPTIONAL for the same never-clobber reason.
  reviewedById: z.string().uuid().nullish(),
  // "Part of Project?" Yes/No (migration 0184). When false the two refs are
  // cleared on write, so a goal can never keep a stale project/vendor after the
  // answer flips back to No. OPTIONAL so an unrelated edit never clobbers them.
  isProject: z.boolean().optional(),
  projectNodeId: z.string().uuid().nullish(),
  vendorId: z.string().uuid().nullish(),
};

const CreateGoalSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.enum(GOAL_PERIODS),
  periodKey: z.string().min(4).max(16),
  ...GoalFields,
});

const AddChildSchema = z.object({
  parentId: z.string().uuid(),
  /** The exact child bucket (quarter/month key) the extra child belongs to. */
  periodKey: z.string().min(4).max(16),
  ...GoalFields,
});

const EditGoalSchema = z.object({
  id: z.string().uuid(),
  ...GoalFields,
  title: GoalFields.title.optional(),
});

const SetPctSchema = z.object({
  id: z.string().uuid(),
  pctDone: z.number().int().min(0).max(100),
});

const AdoptSchema = z.object({ id: z.string().uuid(), adopted: z.boolean() });
const IdSchema = z.object({ id: z.string().uuid() });
const CarrySchema = z.object({
  id: z.string().uuid(),
  targetPeriodKey: z.string().min(4).max(16),
  retainProgress: z.boolean().optional(),
});

type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
type AddChildInput = z.infer<typeof AddChildSchema>;
type EditGoalInput = z.infer<typeof EditGoalSchema>;

/* ------------------------------------------------------------------ */
/* Create — standalone at any level (parent_goal_id = null)            */
/* ------------------------------------------------------------------ */

export async function createGoal(
  input: CreateGoalInput,
): Promise<ActionResult<{ id: string; row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const accessScope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(accessScope, d.employeeId)) {
    return { ok: false, error: "You can't add goals for that person" };
  }
  // New goals land in the admin's ACTIVE space (personal | professional).
  const space = await goalsSpace(isAdmin);

  const position = await nextGoalPosition(d.employeeId, d.period, d.periodKey);
  const [row] = await db
    .insert(goals)
    .values({
      employeeId: d.employeeId,
      period: d.period,
      periodKey: d.periodKey,
      parentGoalId: null,
      position,
      scope: space,
      area: d.area ?? null,
      title: d.title,
      uom: d.uom ?? null,
      targetQty: money(d.targetQty),
      targetAmount: money(d.targetAmount),
      actualQty: money(d.actualQty),
      actualAmount: money(d.actualAmount),
      notes: d.notes ?? null,
      teamInvolved: d.teamInvolved ?? null,
      teamDependencyPct: d.teamDependencyPct ?? null,
      // #7 — a goal created WITH members is instantly shared onto their boards.
      shareWithTeam: d.shareWithTeam ?? hasTeamMembers(d.teamInvolved),
      delegatedTo: d.delegatedTo ?? null,
      weight: d.weight ?? 100,
      incentiveEnabled: d.incentiveEnabled ?? false,
      incentiveAmount: money(d.incentiveAmount),
      incentiveKind: d.incentiveKind ?? null,
      monthlyMasterRef: d.monthlyMasterRef ?? null,
      // "Part of Project?" — the refs only persist when the answer is Yes.
      isProject: d.isProject ?? false,
      projectNodeId: d.isProject ? (d.projectNodeId ?? null) : null,
      vendorId: d.isProject ? (d.vendorId ?? null) : null,
      // Target date lives on MONTH goals only (year/quarter roll up from children).
      targetDate: d.period === "month" ? d.targetDate || null : null,
      adopted: true,
      source: "manual",
      category: d.category ?? "goal",
      createdById: me.id,
      updatedById: me.id,
    })
    .returning();

  if (!row) return { ok: false, error: "Insert returned no row" };
  // Phase 7 (§4.4.6): best-effort activity to the outbox — never blocks the write.
  void logGoalActivity(row.id, GoalEventTypes.CascadeCreated, {
    employeeId: row.employeeId,
    goalKind: "cascade",
    detail: row.title,
  }, me.id);
  revalidateGoals(d.periodKey);
  return { ok: true, id: row.id, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Bulk create — the header "Bulk upload" flow. Import many goals into  */
/* ONE {level, periodKey} bucket for the viewed person in a single      */
/* transaction (all rows land or none do), each row zod-validated,      */
/* positions assigned sequentially from the bucket's next Sr. No.       */
/* Append-only (v1) — never touches existing rows. RETURNS the created  */
/* rows so the board can reconcile (or the client may router.refresh).  */
/* ------------------------------------------------------------------ */

const BulkRowSchema = z.object({
  area: z.string().max(160).nullish(),
  title: z.string().min(1, "Goal is required").max(400),
  uom: z.string().max(80).nullish(),
  weight: z.number().int().min(0).max(1000).optional(),
  targetQty: MoneyIn,
  actualQty: MoneyIn,
  targetAmount: MoneyIn,
  /** Type tag (Operational / Milestone / … or a custom admin Type). */
  category: z.string().max(60).nullish(),
  /** Delegate members picked in the bulk grid — auto-shares to their boards. */
  delegatedTo: z
    .array(z.object({ employeeId: z.string().uuid(), name: z.string().optional(), pct: z.number().min(0).max(100) }))
    .optional(),
});

const BulkCreateSchema = z.object({
  employeeId: z.string().uuid(),
  /** The level the bucket lives at (matches the board's `props.level`). */
  level: z.enum(GOAL_PERIODS),
  periodKey: z.string().min(4).max(16),
  rows: z.array(BulkRowSchema).min(1).max(200),
  /** Provenance — 'manual' (default) | 'ai' (Goal Capture) | 'import'. */
  source: z.string().max(20).optional(),
  /** Goal Capture batch id, so an AI batch can be undone as a unit. */
  captureBatchId: z.string().uuid().optional(),
});

export async function bulkCreateGoals(
  input: z.infer<typeof BulkCreateSchema>,
): Promise<ActionResult<{ rows: GoalDTO[]; created: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = BulkCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(scope, d.employeeId)) {
    return { ok: false, error: "You can't add goals for that person" };
  }

  // Bucket weights must total ≤ 100. Rows with an EXPLICIT weight are validated
  // against the remaining budget; rows left unweighted auto-distribute whatever
  // is left evenly — so a plain "add N goals" / AI-capture never exceeds 100.
  const existingWeight = await bucketWeightSum(d.employeeId, d.level, d.periodKey);
  const remaining = Math.max(0, WEIGHT_CAP - existingWeight);
  const explicitSum = d.rows.reduce((s, r) => s + (r.weight ?? 0), 0);
  if (explicitSum > remaining) {
    return {
      ok: false,
      error: `These goals' weights total ${explicitSum}% but only ${remaining}% is left in this period (${existingWeight}% already used). Lower them to fit.`,
    };
  }
  const unweightedCount = d.rows.filter((r) => r.weight === undefined).length;
  const autoEach = unweightedCount > 0 ? Math.floor((remaining - explicitSum) / unweightedCount) : 0;

  const start = await nextGoalPosition(d.employeeId, d.level, d.periodKey);

  try {
    const inserted = await db.transaction(async (tx) => {
      const values = d.rows.map((r, i) => {
        // Auto % Done from Target ÷ Actual when both drive the row (same rule as
        // the inline table); otherwise 0.
        const auto = autoPctDone(r.targetQty, r.actualQty);
        return {
          employeeId: d.employeeId,
          period: d.level,
          periodKey: d.periodKey,
          parentGoalId: null,
          position: start + i,
          area: r.area ?? null,
          title: r.title,
          uom: r.uom ?? null,
          targetQty: money(r.targetQty),
          actualQty: money(r.actualQty),
          targetAmount: money(r.targetAmount),
          weight: r.weight ?? autoEach,
          pctDone: auto ?? 0,
          status: auto != null ? statusForPct(auto) : "not_started",
          adopted: true,
          source: d.source ?? "manual",
          captureBatchId: d.captureBatchId ?? null,
          category: (r.category ?? "").trim() || "goal",
          delegatedTo: r.delegatedTo && r.delegatedTo.length > 0 ? r.delegatedTo : null,
          shareWithTeam: r.delegatedTo && r.delegatedTo.length > 0 ? true : undefined,
          createdById: me.id,
          updatedById: me.id,
        };
      });
      return tx.insert(goals).values(values).returning();
    });

    if (inserted.length === 0) return { ok: false, error: "Nothing was imported." };
    // Best-effort activity per row — never blocks the write.
    for (const row of inserted) {
      void logGoalActivity(row.id, GoalEventTypes.CascadeCreated, {
        employeeId: row.employeeId,
        goalKind: "cascade",
        detail: row.title,
      }, me.id);
    }
    revalidateGoals(d.periodKey);
    return { ok: true, rows: inserted.map(toGoalDTO), created: inserted.length };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Set a goal's category tag + its involved team (Kanban marking)      */
/* ------------------------------------------------------------------ */

export async function setGoalCategory(
  input: { id: string; category: z.infer<typeof CATEGORY> },
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid(), category: CATEGORY }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const [row] = await db
    .update(goals)
    .set({ category: parsed.data.category, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "Goal not found" };
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row) };
}

export async function setGoalTeam(
  input: { id: string; team: Array<{ employeeId?: string; name?: string; weight?: number }> },
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z
    .object({
      id: z.string().uuid(),
      team: z
        .array(
          z.object({
            employeeId: z.string().uuid().optional(),
            name: z.string().max(120).optional(),
            weight: z.number().int().min(0).max(1000).optional(),
          }),
        )
        .max(40),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const [row] = await db
    .update(goals)
    // #7 — setting the team instantly shares the goal onto the members' boards.
    .set({
      teamInvolved: parsed.data.team,
      shareWithTeam: hasTeamMembers(parsed.data.team),
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "Goal not found" };
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Add a child under a parent (§11b-G "+ Add child goal")              */
/* year → quarter child, quarter → month child. Month → week children  */
/* are generated via `generateGoalChildren` (they live on weekly_goals).*/
/* ------------------------------------------------------------------ */

export async function addChildGoal(
  input: AddChildInput,
): Promise<ActionResult<{ id: string; row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddChildSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.parentId, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const parent = loaded.row;

  const childPeriod =
    parent.period === "year" ? "quarter" : parent.period === "quarter" ? "month" : null;
  if (!childPeriod) {
    return {
      ok: false,
      error: "Add weekly goals from the month view - use “Generate weekly rows”.",
    };
  }

  const position = await nextGoalPosition(parent.employeeId, childPeriod, d.periodKey);
  const [row] = await db
    .insert(goals)
    .values({
      employeeId: parent.employeeId,
      period: childPeriod,
      periodKey: d.periodKey,
      parentGoalId: parent.id,
      position,
      scope: parent.scope, // child inherits the parent's space
      area: d.area ?? parent.area,
      title: d.title,
      uom: d.uom ?? parent.uom,
      targetQty: money(d.targetQty),
      targetAmount: money(d.targetAmount),
      // bug #21 — the schema accepts these three but the insert used to drop
      // them (createGoal persists all of them; keep the two in lockstep).
      actualQty: money(d.actualQty),
      actualAmount: money(d.actualAmount),
      notes: d.notes ?? null,
      teamInvolved: d.teamInvolved ?? null,
      teamDependencyPct: d.teamDependencyPct ?? null,
      // #7 — a child created WITH members is instantly shared onto their boards.
      shareWithTeam: d.shareWithTeam ?? hasTeamMembers(d.teamInvolved),
      delegatedTo: d.delegatedTo ?? null,
      weight: d.weight ?? 100,
      incentiveEnabled: d.incentiveEnabled ?? false,
      incentiveAmount: money(d.incentiveAmount),
      incentiveKind: d.incentiveKind ?? null,
      monthlyMasterRef: d.monthlyMasterRef ?? null,
      // "Part of Project?" — the refs only persist when the answer is Yes.
      isProject: d.isProject ?? false,
      projectNodeId: d.isProject ? (d.projectNodeId ?? null) : null,
      vendorId: d.isProject ? (d.vendorId ?? null) : null,
      // Target date lives on MONTH goals only (a quarter child never carries one).
      targetDate: childPeriod === "month" ? d.targetDate || null : null,
      adopted: true,
      source: "manual",
      category: d.category ?? "goal",
      createdById: me.id,
      updatedById: me.id,
    })
    .returning();

  if (!row) return { ok: false, error: "Insert returned no row" };
  void logGoalActivity(row.id, GoalEventTypes.CascadeCreated, {
    employeeId: row.employeeId,
    goalKind: "cascade",
    detail: row.title,
  }, me.id);
  revalidateGoals(d.periodKey, parent.periodKey);
  return { ok: true, id: row.id, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Edit fields                                                          */
/* ------------------------------------------------------------------ */

export async function editGoal(
  input: EditGoalInput,
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EditGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  // Option A — a CASCADED (auto-generated) goal's TARGET is structure: only an
  // admin or the owner's manager may change it. The owner keeps actuals, notes,
  // title and progress fully open.
  if (
    loaded.row.source === "cascade" &&
    (d.targetQty !== undefined || d.targetAmount !== undefined)
  ) {
    const pol = await policyGate({ id: me.id, isAdmin }, loaded.row.employeeId);
    if (pol && !pol.canEditCascadedTargets) {
      return { ok: false, error: POLICY_REASONS.cascadedTargets };
    }
  }

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  if (d.title !== undefined) patch.title = d.title;
  // bug #21 — `category` was accepted by the schema but silently dropped here,
  // so the returned row reverted the optimistic value with ok:true.
  if (d.category !== undefined) patch.category = d.category;
  if (d.goalType !== undefined) patch.goalType = d.goalType ?? null;
  if (d.area !== undefined) patch.area = d.area ?? null;
  if (d.uom !== undefined) patch.uom = d.uom ?? null;
  if (d.targetQty !== undefined) patch.targetQty = money(d.targetQty);
  if (d.targetAmount !== undefined) patch.targetAmount = money(d.targetAmount);
  if (d.actualQty !== undefined) patch.actualQty = money(d.actualQty);
  if (d.actualAmount !== undefined) patch.actualAmount = money(d.actualAmount);
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (d.teamInvolved !== undefined) patch.teamInvolved = d.teamInvolved ?? null;
  if (d.teamDependencyPct !== undefined) patch.teamDependencyPct = d.teamDependencyPct ?? null;
  if (d.shareWithTeam !== undefined) patch.shareWithTeam = d.shareWithTeam;
  if (d.delegatedTo !== undefined) patch.delegatedTo = d.delegatedTo ?? null;
  // #7 — instant share: adding real team members auto-enables shareWithTeam so
  // the goal lands on their boards immediately (removing the last member turns it
  // back off). A caller that sets shareWithTeam explicitly always wins.
  if (d.teamInvolved !== undefined && d.shareWithTeam === undefined) {
    patch.shareWithTeam = hasTeamMembers(d.teamInvolved);
  }
  if (d.weight !== undefined) {
    patch.weight = d.weight;
    // A bucket's weights must total ≤ 100. Block an INCREASE that would push the
    // total over; reductions are always allowed (so an over-100 bucket — e.g.
    // legacy data — can be corrected down).
    const currentW = loaded.row.weight ?? 0;
    if (d.weight > currentW) {
      const others = await bucketWeightSum(loaded.row.employeeId, loaded.row.period, loaded.row.periodKey, d.id);
      if (others + d.weight > WEIGHT_CAP) {
        return {
          ok: false,
          error: `Total weight for this period would be ${others + d.weight}% - keep all goals' weights at or below 100% combined (${WEIGHT_CAP - others}% left).`,
        };
      }
    }
  }
  if (d.incentiveEnabled !== undefined) patch.incentiveEnabled = d.incentiveEnabled;
  if (d.incentiveAmount !== undefined) patch.incentiveAmount = money(d.incentiveAmount);
  if (d.incentiveKind !== undefined) patch.incentiveKind = d.incentiveKind ?? null;
  // "Part of Project?" — answering No CLEARS the project + vendor in the same
  // write, so a goal can never keep a stale tag it no longer claims.
  if (d.isProject !== undefined) {
    patch.isProject = d.isProject;
    if (!d.isProject) {
      patch.projectNodeId = null;
      patch.vendorId = null;
    }
  }
  if (d.projectNodeId !== undefined && d.isProject !== false) patch.projectNodeId = d.projectNodeId ?? null;
  if (d.vendorId !== undefined && d.isProject !== false) patch.vendorId = d.vendorId ?? null;
  if (d.monthlyMasterRef !== undefined) patch.monthlyMasterRef = d.monthlyMasterRef ?? null;
  // Target date is a MONTH-only field — accept the edit only on month rows so a
  // year/quarter goal can never acquire a deadline through the API.
  if (d.targetDate !== undefined && loaded.row.period === "month") {
    patch.targetDate = d.targetDate || null;
  }
  // Inline Status — a directly-set status persists as-is. (When a numeric Target/
  // Actual drives the row, the auto-derive block below re-derives status from the
  // %; a lone Status edit never carries those keys, so this value stands.)
  if (d.status !== undefined) patch.status = d.status;
  // Inline Reviewer — write the designated reviewer (or null to clear).
  if (d.reviewedById !== undefined) patch.reviewedById = d.reviewedById ?? null;

  // Auto % Done from Target / Actual — when a numeric target (> 0) drives the
  // goal, its progress IS Actual ÷ Target (clamped 0–100), so % Done can never
  // drift from the numbers. Recompute only when target or actual just changed;
  // when it isn't computable (no/zero target, or no actual) % Done is left to
  // manual entry (setGoalPctDone).
  if (d.targetQty !== undefined || d.actualQty !== undefined) {
    const effTarget = d.targetQty !== undefined ? money(d.targetQty) : loaded.row.targetQty;
    const effActual = d.actualQty !== undefined ? money(d.actualQty) : loaded.row.actualQty;
    const auto = autoPctDone(effTarget, effActual);
    if (auto !== null) {
      patch.pctDone = auto;
      patch.status = statusForPct(auto);
    }
  }

  const [row] = await db.update(goals).set(patch).where(eq(goals.id, d.id)).returning();
  if (!row) return { ok: false, error: "Goal not found" };

  // #2 — email/notify anyone NEWLY named as a team member or delegate on this
  // goal. The moment their name is entered they get a "you've been added to a
  // goal" notification across every channel they've opted into (email included).
  // Deferred to `afterResponse` so the Resend/channel fan-out never adds latency
  // to the inline grid edit, and notify() itself swallows any dispatch failure.
  {
    const idsOf = (arr: ReadonlyArray<{ employeeId?: string | null }> | null | undefined) =>
      new Set((arr ?? []).map((m) => m.employeeId).filter((x): x is string => !!x));
    const added = new Set<string>();
    if (d.teamInvolved !== undefined) {
      const before = idsOf(loaded.row.teamInvolved as ReadonlyArray<{ employeeId?: string | null }> | null);
      for (const id of idsOf(d.teamInvolved)) if (!before.has(id)) added.add(id);
    }
    if (d.delegatedTo !== undefined) {
      const before = idsOf(loaded.row.delegatedTo as ReadonlyArray<{ employeeId?: string | null }> | null);
      for (const id of idsOf(d.delegatedTo)) if (!before.has(id)) added.add(id);
    }
    added.delete(me.id); // never notify yourself for your own edit
    if (added.size > 0) {
      const title = row.title;
      const actor = me.name;
      const actorId = me.id;
      afterResponse(async () => {
        for (const uid of added) {
          await notify({
            userId: uid,
            kind: "weekly_goals_assigned",
            title: "You've been added to a goal",
            body: `${actor} added you to the goal "${title}".`,
            actorId,
          });
        }
      });
    }
  }

  const changed = Object.keys(patch).filter((k) => k !== "updatedById" && k !== "updatedAt");
  if (changed.length > 0) {
    void logGoalActivity(row.id, GoalEventTypes.CascadeEdited, {
      employeeId: row.employeeId,
      goalKind: "cascade",
      detail: changed.join(", "),
    }, me.id);
  }
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Monthly-Master pickables — obligations + scheduled batches for the   */
/* goal drawer's event/task combobox. Read-only; gated by goals access. */
/* ------------------------------------------------------------------ */

export async function listGoalMasterPickables(): Promise<
  ActionResult<{ items: MonthlyMasterPickable[] }>
> {
  await requireGoalsAccess();
  const items = await listMonthlyMasterPickables();
  return { ok: true, items };
}

/* ------------------------------------------------------------------ */
/* Self-rating (owner sets pct_done)                                   */
/* ------------------------------------------------------------------ */

export async function setGoalPctDone(
  input: z.infer<typeof SetPctSchema>,
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetPctSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const pct = parsed.data.pctDone;
  const [row] = await db
    .update(goals)
    .set({
      pctDone: pct,
      status: pct >= 100 ? "done" : pct > 0 ? "initiated" : "not_started",
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "Goal not found" };
  void logGoalActivity(row.id, GoalEventTypes.CascadeProgressSet, {
    employeeId: row.employeeId,
    goalKind: "cascade",
    from: loaded.row.pctDone,
    to: pct,
  }, me.id);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Adopt / cross-out (cascade-drop the subtree)                        */
/* ------------------------------------------------------------------ */

export async function setGoalAdopted(
  input: z.infer<typeof AdoptSchema>,
): Promise<ActionResult<{ row: GoalDTO; rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AdoptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  // Recursive-CTE subtree mirror (goals + weekly leaves) — preserved unchanged.
  const mutatedIds = await setAdopted(parsed.data.id, parsed.data.adopted);
  // bug #22 — the helper touches a whole SUBTREE: return every mutated goal row
  // through the rows-reconcile path so the optimistic cross-out of descendants
  // doesn't snap back when the action settles (weekly leaves still arrive via
  // revalidation — they live on the other table/overlay).
  const rows = await db.select().from(goals).where(inArray(goals.id, mutatedIds));
  const row = rows.find((r) => r.id === parsed.data.id);
  if (!row) return { ok: false, error: "Goal not found" };
  void logGoalActivity(row.id, GoalEventTypes.CascadeAdopted, {
    employeeId: row.employeeId,
    goalKind: "cascade",
    to: parsed.data.adopted ? "adopted" : "crossed out",
  }, me.id);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row), rows: rows.map(toGoalDTO) };
}

/* ------------------------------------------------------------------ */
/* Generate cascade children (÷ prepopulate, idempotent)               */
/* ------------------------------------------------------------------ */

export async function generateGoalChildren(
  input: z.infer<typeof IdSchema>,
): Promise<ActionResult<{ created: number; childLevel: string | null }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  // Option A — auto-divide manufactures cascade STRUCTURE: admin/manager only
  // (the owner still creates manual children freely via addChildGoal).
  const pol = await policyGate({ id: me.id, isAdmin }, loaded.row.employeeId);
  if (pol && !pol.canAutoDivide) return { ok: false, error: POLICY_REASONS.autoDivide };

  const res = await generateChildren(parsed.data.id);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, created: res.created, childLevel: res.childLevel };
}

/* ------------------------------------------------------------------ */
/* Move-unfinished-forward — clone (default) or move (destructive)     */
/* ------------------------------------------------------------------ */

export async function cloneGoalForward(
  input: z.infer<typeof CarrySchema>,
): Promise<ActionResult<{ id: string; row: GoalDTO | null }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CarrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const res = await cloneForward(parsed.data.id, parsed.data.targetPeriodKey, {
    retainProgress: parsed.data.retainProgress === true,
    actorId: me.id,
  });
  if (!res.ok) return res;
  // Return the created clone so the canvas can reconcile without a refetch.
  const [row] = await db.select().from(goals).where(eq(goals.id, res.id)).limit(1);
  revalidateGoals(loaded.row.periodKey, parsed.data.targetPeriodKey);
  return { ok: true, id: res.id, row: row ? toGoalDTO(row) : null };
}

export async function moveGoalForward(
  input: z.infer<typeof CarrySchema>,
): Promise<ActionResult<{ row: GoalDTO | null }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CarrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const res = await moveTo(parsed.data.id, parsed.data.targetPeriodKey, me.id);
  if (!res.ok) return res;
  // bug #22 — return the re-timeframed row so the optimistic move reconciles
  // with server truth instead of snapping back on settle.
  const [row] = await db.select().from(goals).where(eq(goals.id, parsed.data.id)).limit(1);
  revalidateGoals(loaded.row.periodKey, parsed.data.targetPeriodKey);
  return { ok: true, row: row ? toGoalDTO(row) : null };
}

/* ------------------------------------------------------------------ */
/* Archive (soft-delete — the row is preserved)                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Weekly leaf — move a weekly goal to another week (kanban, item 19)  */
/* ------------------------------------------------------------------ */

const MoveWeeklySchema = z.object({
  id: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week"),
});

export async function moveWeeklyToWeek(
  input: z.infer<typeof MoveWeeklySchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveWeeklySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const [w] = await db
    .select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, parsed.data.id))
    .limit(1);
  if (!w) return { ok: false, error: "Weekly goal not found." };
  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!(w.employeeId === me.id || canManageGoalFor(scope, w.employeeId))) {
    return { ok: false, error: "That goal isn't yours to move." };
  }

  const [row] = await db
    .update(weeklyGoals)
    .set({ weekStart: parsed.data.weekStart, updatedAt: new Date() })
    .where(eq(weeklyGoals.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "Weekly goal not found." };
  // bug #17 — this weekly move must refresh the level routes too (it used to
  // touch only /goals/cascade, so /goals/week never reconciled in-session);
  // the legacy weekly board renders the same rows.
  revalidateGoals();
  revalidatePath("/goals/weekly");
  return { ok: true, row };
}

/* ------------------------------------------------------------------ */
/* Day leaf — move a DAY goal to another day (the Weekly board's Week→  */
/* Day kanban re-home). Day goals live in `goals` (period='day', a date */
/* periodKey); moveGoalToPeriod refuses day shapes, so this sibling     */
/* re-home writes the new date + a fresh Sr. No. in the target day.     */
/* ------------------------------------------------------------------ */

const MoveDaySchema = z.object({
  id: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid day"),
});

export async function moveDayGoalToDate(
  input: z.infer<typeof MoveDaySchema>,
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveDaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.period !== "day") {
    return { ok: false, error: "Only a day goal can be moved between days." };
  }
  if (row.periodKey === parsed.data.day) return { ok: true, row: toGoalDTO(row) };

  const position = await nextGoalPosition(row.employeeId, "day", parsed.data.day);
  const [updated] = await db
    .update(goals)
    .set({
      periodKey: parsed.data.day,
      position,
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, parsed.data.id))
    .returning();
  if (!updated) return { ok: false, error: "Goal not found" };
  void logGoalActivity(updated.id, GoalEventTypes.CascadeEdited, {
    employeeId: updated.employeeId,
    goalKind: "cascade",
    detail: `moved day ${row.periodKey} → ${parsed.data.day}`,
  }, me.id);
  revalidateGoals(row.periodKey, parsed.data.day);
  revalidatePath("/goals/weekly");
  return { ok: true, row: toGoalDTO(updated) };
}

/* ------------------------------------------------------------------ */
/* Re-period a cascade goal — drag between SIBLING buckets at the same  */
/* level (bug #8: the board's Q1→Q3 / Jul→Aug period-lane drag; only    */
/* weekly rows could be re-perioded before via moveWeeklyToWeek).       */
/* ------------------------------------------------------------------ */

const MovePeriodSchema = z.object({
  id: z.string().uuid(),
  /** The target sibling bucket at the goal's OWN level ("2026-Q3" / "2026-08"). */
  periodKey: z.string().min(4).max(16),
});

export async function moveGoalToPeriod(
  input: z.infer<typeof MovePeriodSchema>,
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MovePeriodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.periodKey === d.periodKey) return { ok: true, row: toGoalDTO(row) };

  // A SIBLING bucket at the same level only — year stays year, quarter stays
  // quarter, month stays month (cross-level moves are promoteToLevel's job).
  const shapeOk =
    row.period === "year"
      ? /^\d{4}$/.test(d.periodKey)
      : row.period === "quarter"
        ? /^\d{4}-Q[1-4]$/.test(d.periodKey)
        : row.period === "month"
          ? /^\d{4}-\d{2}$/.test(d.periodKey)
          : false;
  if (!shapeOk) {
    return { ok: false, error: "Drop the card on a bucket at its own level." };
  }

  // Keep the parent link only while the parent still OWNS the target bucket
  // (a year owns its 4 quarters; a quarter its 3 months). Otherwise the row
  // becomes a standalone in the new bucket — still visible via the planner's
  // parentless-union (bug #7).
  let parentGoalId: string | null = row.parentGoalId;
  if (parentGoalId) {
    const [parent] = await db
      .select({ periodKey: goals.periodKey })
      .from(goals)
      .where(eq(goals.id, parentGoalId))
      .limit(1);
    const parentOwnerKey =
      row.period === "quarter"
        ? String(fyStartYearOfKey(d.periodKey))
        : row.period === "month"
          ? quarterKeyOfMonthKey(d.periodKey)
          : null;
    if (!parent || parentOwnerKey == null || parent.periodKey !== parentOwnerKey) {
      parentGoalId = null;
    }
  }

  const position = await nextGoalPosition(row.employeeId, row.period, d.periodKey);
  const [updated] = await db
    .update(goals)
    .set({
      periodKey: d.periodKey,
      parentGoalId,
      position,
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, d.id))
    .returning();
  if (!updated) return { ok: false, error: "Goal not found" };
  void logGoalActivity(updated.id, GoalEventTypes.CascadeEdited, {
    employeeId: updated.employeeId,
    goalKind: "cascade",
    detail: `moved ${row.periodKey} → ${d.periodKey}`,
  }, me.id);
  revalidateGoals(row.periodKey, d.periodKey);
  return { ok: true, row: toGoalDTO(updated) };
}

/* ------------------------------------------------------------------ */
/* Move to… — TRUE re-home across LEVELS and PERIODS (the per-card       */
/* "Move to…" menu). Generalises moveGoalToPeriod (same-level lane drag) */
/* to ANY year/quarter/month bucket: re-periods the row, re-parents it   */
/* to the goal that OWNS the target's parent bucket for the same person  */
/* (else standalone / null for year), and assigns a fresh position in    */
/* the destination. WEEK targets are deliberately out of scope for       */
/* goals-table rows — that move crosses tables into weekly_goals (where  */
/* the ritual stamps live); weekly rows keep moveWeeklyToWeek.           */
/* ------------------------------------------------------------------ */

const MoveLevelSchema = z.object({
  id: z.string().uuid(),
  targetPeriod: z.enum(GOAL_PERIODS),
  /** The destination bucket at `targetPeriod` ("2026" / "2026-Q3" / "2026-08"). */
  targetPeriodKey: z.string().min(4).max(16),
});

export async function moveGoalToLevel(
  input: z.infer<typeof MoveLevelSchema>,
): Promise<ActionResult<{ row: GoalDTO; rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveLevelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const row = loaded.row;

  // The key's SHAPE must name the target level (same guards as moveGoalToPeriod).
  const shapeOk =
    d.targetPeriod === "year"
      ? /^\d{4}$/.test(d.targetPeriodKey)
      : d.targetPeriod === "quarter"
        ? /^\d{4}-Q[1-4]$/.test(d.targetPeriodKey)
        : /^\d{4}-\d{2}$/.test(d.targetPeriodKey);
  if (!shapeOk) {
    return { ok: false, error: "That bucket doesn't match the target level." };
  }
  if (row.period === d.targetPeriod && row.periodKey === d.targetPeriodKey) {
    return { ok: true, row: toGoalDTO(row), rows: [] };
  }

  // Option A — re-homing ACROSS levels is structure (admin/manager only); a
  // same-level bucket move through this verb stays an owner-open re-quarter.
  if (row.period !== d.targetPeriod) {
    const pol = await policyGate({ id: me.id, isAdmin }, row.employeeId);
    if (pol && !pol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };
  }

  // Re-parent: the same person's goal OWNING the parent bucket one level up
  // (a year owns its quarters; a quarter its months) — position-first when the
  // bucket holds several. None → standalone; year targets are always roots.
  // `ne` guards the self-parent cycle (a year goal moved down still matches
  // its own old bucket at select time).
  const parentPeriod =
    d.targetPeriod === "quarter" ? "year" : d.targetPeriod === "month" ? "quarter" : null;
  const parentOwnerKey =
    d.targetPeriod === "quarter"
      ? String(fyStartYearOfKey(d.targetPeriodKey))
      : d.targetPeriod === "month"
        ? quarterKeyOfMonthKey(d.targetPeriodKey)
        : null;
  let parentGoalId: string | null = null;
  if (parentPeriod && parentOwnerKey) {
    const [parent] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, row.employeeId),
          eq(goals.period, parentPeriod),
          eq(goals.periodKey, parentOwnerKey),
          eq(goals.archived, false),
          ne(goals.id, row.id),
        ),
      )
      .orderBy(goals.position)
      .limit(1);
    parentGoalId = parent?.id ?? null;
  }

  const position = await nextGoalPosition(row.employeeId, d.targetPeriod, d.targetPeriodKey);
  const levelChanged = row.period !== d.targetPeriod;
  const [moved] = await db
    .update(goals)
    .set({
      period: d.targetPeriod,
      periodKey: d.targetPeriodKey,
      parentGoalId,
      position,
      // Cross-level: the cascade linkage is broken by design — same stance as
      // promoteToLevel (the row becomes a manual goal at its new level).
      ...(levelChanged ? { source: "manual" as const } : {}),
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, d.id))
    .returning();
  if (!moved) return { ok: false, error: "Goal not found" };

  // A cross-level move can leave direct children whose level no longer sits
  // one below the moved row (e.g. year→quarter keeps its quarter children):
  // detach those so the tree never nests same/higher levels — they stay
  // visible via the planner's parentless-union (bug #7). Returned through the
  // rows-reconcile path so the optimistic tree doesn't snap back (bug #22).
  let detached: (typeof goals.$inferSelect)[] = [];
  if (levelChanged) {
    const childLevel =
      d.targetPeriod === "year" ? "quarter" : d.targetPeriod === "quarter" ? "month" : null;
    detached = await db
      .update(goals)
      .set({ parentGoalId: null, updatedById: me.id, updatedAt: new Date() })
      .where(
        and(
          eq(goals.parentGoalId, moved.id),
          childLevel ? ne(goals.period, childLevel) : sql`true`,
        ),
      )
      .returning();
  }

  void logGoalActivity(moved.id, GoalEventTypes.CascadeEdited, {
    employeeId: moved.employeeId,
    goalKind: "cascade",
    detail: `moved ${row.period} ${row.periodKey} → ${d.targetPeriod} ${d.targetPeriodKey}`,
  }, me.id);
  revalidateGoals(row.periodKey, d.targetPeriodKey);
  return { ok: true, row: toGoalDTO(moved), rows: detached.map(toGoalDTO) };
}

/* ------------------------------------------------------------------ */
/* Phase 4 — CROSS-TABLE conversions: Week + Day become REAL drop        */
/* targets. A goals-table row can't simply be re-perioded into a week or */
/* a day (those live on weekly_goals / daily_checklist, where the ritual */
/* stamps + the compulsory plan gate live) — so the move is a CONVERT:    */
/* insert the derived row in the target table, soft-archive the source   */
/* goals row, link provenance, and RETURN both sides so the optimistic   */
/* spines reconcile. The archived source is returned as `sourceRow` —    */
/* deliberately NOT `row`, so `useOptimisticGoals.mutate` never re-adds  */
/* an archived row through the confirmed overlay (the client applies a   */
/* {type:"remove"} patch; revalidation settles it). `rows` carries the   */
/* detached children (live rows — safe to reconcile).                    */
/* ------------------------------------------------------------------ */

/** Next Sr. No. within an (employee, week) weekly bucket — mirrors the weekly
 *  surface's private `nextPosition` (app/(app)/goals/weekly/actions.ts). */
async function nextWeeklyPosition(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int` })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)));
  return (row?.max ?? 0) + 1;
}

/**
 * Detach the direct children of a converted (archived) source so the tree never
 * dangles under an archived parent — same stance as moveGoalToLevel's detach,
 * returned through the rows-reconcile path (bugs #7/#22). Children stay visible
 * via the planner's parentless-union.
 */
async function detachChildrenOf(goalId: string, actorId: string) {
  return db
    .update(goals)
    .set({ parentGoalId: null, updatedById: actorId, updatedAt: new Date() })
    .where(eq(goals.parentGoalId, goalId))
    .returning();
}

const ConvertWeeklySchema = z.object({
  id: z.string().uuid(),
  /** Any day of the target week — normalised to its Monday. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week"),
});

/**
 * Move a cascade goal (year/quarter/month) DOWN into a specific week: create a
 * weekly_goals row carrying title/area/uom/targets/actuals/weight/progress,
 * linked up to the month goal owning the target week (if the person has one),
 * then soft-archive the source. Ritual model respected — the converted row
 * starts UNCOMMITTED and UNAPPROVED (a fresh week needs a fresh Saturday
 * commit; stamps are never fabricated).
 */
export async function convertGoalToWeekly(
  input: z.infer<typeof ConvertWeeklySchema>,
): Promise<ActionResult<{ sourceRow: GoalDTO; rows: GoalDTO[]; weeklyRow: WeeklyRow }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ConvertWeeklySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  if (src.archived) return { ok: false, error: "That goal is already archived." };

  // Option A — crossing tables into weekly_goals IS a cross-level re-home
  // (structure): same gate as moveGoalToLevel, no bypass.
  const pol = await policyGate({ id: me.id, isAdmin }, src.employeeId);
  if (pol && !pol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };

  const weekStart = mondayOf(parsed.data.weekStart);

  // Parent linkage: the same person's month goal OWNING the target week's month
  // (mirrors moveGoalToLevel's re-parent rule) — position-first, none → standalone.
  // `ne` guards a month source landing inside its own (about-to-archive) bucket.
  const [monthParent] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, src.employeeId),
        eq(goals.period, "month"),
        eq(goals.periodKey, weekStart.slice(0, 7)),
        eq(goals.archived, false),
        ne(goals.id, src.id),
      ),
    )
    .orderBy(goals.position)
    .limit(1);

  try {
    const position = await nextWeeklyPosition(src.employeeId, weekStart);
    const [weeklyRow] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: src.employeeId,
        weekStart,
        position,
        // target_done is the column every weekly surface renders as the title.
        targetDone: src.title,
        area: src.area,
        uom: src.uom,
        targetQty: src.targetQty,
        targetAmount: src.targetAmount,
        actualQty: src.actualQty,
        actualAmount: src.actualAmount,
        notes: src.notes,
        teamInvolved: src.teamInvolved,
        teamDependencyPct: src.teamDependencyPct,
        weight: src.weight,
        pctDone: src.pctDone,
        status: src.status,
        monthGoalId: monthParent?.id ?? null,
        adopted: true,
        // Ritual stamps NEVER fabricated — fresh week, fresh commit/approval.
        committedAt: null,
        approvedByManagerAt: null,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning();
    if (!weeklyRow) return { ok: false, error: "Insert returned no row" };

    // Provenance stamp (migration 0144 — possibly UNAPPLIED): the column is
    // deliberately NOT in db/schema.ts (bare weekly selects would break while
    // unapplied), so this is guarded raw SQL that silently no-ops until 0144
    // lands. The activity log below keeps the trail meanwhile.
    try {
      await db.execute(
        sql`update weekly_goals set converted_from_goal_id = ${src.id}::uuid where id = ${weeklyRow.id}::uuid`,
      );
    } catch {
      // 0144 unapplied — provenance column unavailable, never fatal.
    }

    // Soft-archive the source (row preserved for history) + detach children.
    const [archivedSrc] = await db
      .update(goals)
      .set({ archived: true, updatedById: me.id, updatedAt: new Date() })
      .where(eq(goals.id, src.id))
      .returning();
    if (!archivedSrc) return { ok: false, error: "Goal not found" };
    const detached = await detachChildrenOf(src.id, me.id);

    void logGoalActivity(src.id, GoalEventTypes.CascadeEdited, {
      employeeId: src.employeeId,
      goalKind: "cascade",
      detail: `moved ${src.period} ${src.periodKey} → week ${weekStart}`,
    }, me.id);
    revalidateGoals(src.periodKey);
    revalidatePath("/goals/weekly");
    revalidatePath("/goals/weekly");
    return {
      ok: true,
      sourceRow: toGoalDTO(archivedSrc),
      rows: detached.map(toGoalDTO),
      weeklyRow,
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Day conversion — a goal becomes a Plan-Your-Day commitment           */
/* ------------------------------------------------------------------ */

/** Hard cap per day — same bound as the planner (plan/actions.ts). */
const MAX_DAILY_ITEMS = 50;

/**
 * Explicit RETURNING list — NEVER bare `.returning()` on daily_checklist: that
 * enumerates 0141's possibly-unapplied `cascade_goal_id` (see db/schema.ts).
 */
const DAILY_ITEM_RETURNING = {
  id: dailyChecklist.id,
  planDate: dailyChecklist.planDate,
  title: dailyChecklist.title,
  subject: dailyChecklist.subject,
  origin: dailyChecklist.origin,
  done: dailyChecklist.done,
  position: dailyChecklist.position,
};

export type ConvertedDailyItem = {
  id: string;
  planDate: string;
  title: string;
  subject: string | null;
  origin: string;
  done: boolean;
  position: number;
};

const ConvertDailySchema = z.object({
  id: z.string().uuid(),
  /** The plan date the commitment lands on (UI default: today). */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid day"),
});

/**
 * Move a cascade goal onto a DAY: create a daily_checklist commitment for the
 * goal's OWNER on `day` (the same table the compulsory plan gate counts and the
 * Plan-Your-Day surface renders), then soft-archive the source. Provenance:
 * 0141's `cascade_goal_id` when available (flag-guarded, legacy title-only
 * fallback while unapplied — exactly the addCascadeGoalToPlan pattern).
 *
 * Known limitation (deliberate): daily_checklist carries title + subject + a
 * done/% close-out — numeric targets/uom/weight are NOT representable on a day
 * row. They stay readable on the archived source via cascade_goal_id, and
 * completion reflects back through the planner's reflectIncremental pipeline.
 */
export async function convertGoalToDaily(
  input: z.infer<typeof ConvertDailySchema>,
): Promise<ActionResult<{ sourceRow: GoalDTO; rows: GoalDTO[]; dailyItem: ConvertedDailyItem }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ConvertDailySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const day = parsed.data.day;

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  if (src.archived) return { ok: false, error: "That goal is already archived." };

  // Option A — crossing tables into the day plan is a cross-level re-home.
  const pol = await policyGate({ id: me.id, isAdmin }, src.employeeId);
  if (pol && !pol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };

  try {
    // Cap + next position for the OWNER's day, one round-trip (plan/actions.ts).
    const [agg] = await db
      .select({
        count: sql<number>`count(*)::int`,
        max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
      })
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, src.employeeId), eq(dailyChecklist.planDate, day)));
    if ((agg?.count ?? 0) >= MAX_DAILY_ITEMS) {
      return { ok: false, error: `That day already has ${MAX_DAILY_ITEMS} planned items.` };
    }
    const base = {
      employeeId: src.employeeId,
      planDate: day,
      origin: "standalone",
      title: src.title,
      subject: src.area,
      position: (agg?.max ?? 0) + 1,
    };

    // Provenance-first insert (0141 cascade_goal_id), guarded: an unapplied
    // migration throws on the unknown column and we fall through to the legacy
    // title-only insert — behaviour degrades, never breaks.
    let dailyItem: ConvertedDailyItem | null = null;
    if (goalsCanvasOn()) {
      try {
        const [row] = await db
          .insert(dailyChecklist)
          .values({ ...base, cascadeGoalId: src.id })
          // Already on that day's plan (0141 unique index) → reuse the entry.
          .onConflictDoNothing({
            target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.cascadeGoalId],
          })
          .returning(DAILY_ITEM_RETURNING);
        dailyItem = row ?? null;
        if (!dailyItem) {
          const [existing] = await db
            .select(DAILY_ITEM_RETURNING)
            .from(dailyChecklist)
            .where(
              and(
                eq(dailyChecklist.employeeId, src.employeeId),
                eq(dailyChecklist.planDate, day),
                eq(dailyChecklist.cascadeGoalId, src.id),
              ),
            )
            .limit(1);
          dailyItem = existing ?? null;
        }
      } catch {
        // 0141 unapplied — legacy path below.
      }
    }
    if (!dailyItem) {
      const [row] = await db.insert(dailyChecklist).values(base).returning(DAILY_ITEM_RETURNING);
      if (!row) return { ok: false, error: "Insert returned no row" };
      dailyItem = row;
    }

    // Soft-archive the source + detach children (same contract as weekly).
    const [archivedSrc] = await db
      .update(goals)
      .set({ archived: true, updatedById: me.id, updatedAt: new Date() })
      .where(eq(goals.id, src.id))
      .returning();
    if (!archivedSrc) return { ok: false, error: "Goal not found" };
    const detached = await detachChildrenOf(src.id, me.id);

    void logGoalActivity(src.id, GoalEventTypes.CascadeEdited, {
      employeeId: src.employeeId,
      goalKind: "cascade",
      detail: `moved ${src.period} ${src.periodKey} → day ${day}`,
    }, me.id);
    // Deliberately NO revalidate of the plan surface itself — plan/actions.ts
    // never revalidates (the compulsory gate would bounce a mid-plan user);
    // the Day stage lazy-loads via loadPlanDay and picks the row up fresh.
    revalidateGoals(src.periodKey);
    return {
      ok: true,
      sourceRow: toGoalDTO(archivedSrc),
      rows: detached.map(toGoalDTO),
      dailyItem,
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Undo a week/day conversion (Phase 5 — the drop toast's [Undo]).       */
/* A cross-table convert can't be reversed by another move verb (the     */
/* source is ARCHIVED and the target row lives in a different table), so */
/* undo is its own inverse: un-archive the source goal, re-attach the    */
/* children the convert detached (ids supplied by the caller — the       */
/* convert returned them), and retire the converted twin (weekly row →   */
/* archived; daily item → deleted, mirroring removePlanItem).            */
/* ------------------------------------------------------------------ */

const UndoConvertSchema = z.object({
  goalId: z.string().uuid(),
  /** The weekly_goals row the conversion created (week drops). */
  weeklyId: z.string().uuid().nullish(),
  /** The daily_checklist row the conversion created (day drops). */
  dailyItemId: z.string().uuid().nullish(),
  /** The children detachChildrenOf orphaned — re-attached only while still
   *  parentless (a concurrent re-parent in the 6s window wins). */
  reattachChildIds: z.array(z.string().uuid()).max(100).optional(),
});

export async function undoConvertGoal(
  input: z.infer<typeof UndoConvertSchema>,
): Promise<ActionResult<{ row: GoalDTO; rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UndoConvertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.goalId, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  if (!src.archived) return { ok: false, error: "That goal isn't archived - nothing to undo." };

  // Same Option-A gate as the convert it reverses — no bypass.
  const pol = await policyGate({ id: me.id, isAdmin }, src.employeeId);
  if (pol && !pol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };

  try {
    const [restored] = await db
      .update(goals)
      .set({ archived: false, updatedById: me.id, updatedAt: new Date() })
      .where(eq(goals.id, src.id))
      .returning();
    if (!restored) return { ok: false, error: "Goal not found" };

    let reattached: (typeof goals.$inferSelect)[] = [];
    if (d.reattachChildIds?.length) {
      reattached = await db
        .update(goals)
        .set({ parentGoalId: src.id, updatedById: me.id, updatedAt: new Date() })
        .where(
          and(
            inArray(goals.id, d.reattachChildIds),
            eq(goals.employeeId, src.employeeId),
            isNull(goals.parentGoalId),
            ne(goals.id, src.id),
          ),
        )
        .returning();
    }

    // Retire the converted twin — owner-scoped so a stale/foreign id no-ops.
    if (d.weeklyId) {
      await db
        .update(weeklyGoals)
        .set({ archived: true, updatedAt: new Date() })
        .where(and(eq(weeklyGoals.id, d.weeklyId), eq(weeklyGoals.employeeId, src.employeeId)));
    }
    if (d.dailyItemId) {
      await db
        .delete(dailyChecklist)
        .where(
          and(eq(dailyChecklist.id, d.dailyItemId), eq(dailyChecklist.employeeId, src.employeeId)),
        );
    }

    void logGoalActivity(src.id, GoalEventTypes.CascadeEdited, {
      employeeId: src.employeeId,
      goalKind: "cascade",
      detail: `undid move of ${src.period} ${src.periodKey} to ${d.weeklyId ? "week" : "day"}`,
    }, me.id);
    revalidateGoals(src.periodKey);
    revalidatePath("/goals/weekly");
    revalidatePath("/goals/weekly");
    return { ok: true, row: toGoalDTO(restored), rows: reattached.map(toGoalDTO) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* moveGoalAcross — ONE dispatcher for the five-level drag (Phase 4).   */
/* year/quarter/month → moveGoalToLevel (in-table re-home); week/day →  */
/* the cross-table conversions above. Each delegate re-asserts access,  */
/* rate-limit and the Option-A structure policy itself — the dispatcher */
/* only validates + routes, so there is exactly one enforcement path.   */
/* ------------------------------------------------------------------ */

const MoveAcrossSchema = z.object({
  id: z.string().uuid(),
  targetLevel: z.enum(["year", "quarter", "month", "week", "day"]),
  /** Destination bucket: "2026" / "2026-Q3" / "2026-08" / "2026-08-03" (week
   *  Monday or plan day — the two date shapes are told apart by targetLevel). */
  bucketKey: z.string().min(4).max(16),
});

export type MoveAcrossResult =
  | { ok: false; error: string }
  | ({ ok: true; rows: GoalDTO[] } & (
      | { kind: "goal"; row: GoalDTO }
      | { kind: "weekly"; sourceRow: GoalDTO; weeklyRow: WeeklyRow }
      | { kind: "daily"; sourceRow: GoalDTO; dailyItem: ConvertedDailyItem }
    ));

export async function moveGoalAcross(
  input: z.infer<typeof MoveAcrossSchema>,
): Promise<MoveAcrossResult> {
  const parsed = MoveAcrossSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, targetLevel, bucketKey } = parsed.data;

  if (targetLevel === "week") {
    const res = await convertGoalToWeekly({ id, weekStart: bucketKey });
    if (!res.ok) return res;
    const { sourceRow, rows, weeklyRow } = res;
    return { ok: true, kind: "weekly", sourceRow, rows, weeklyRow };
  }
  if (targetLevel === "day") {
    const res = await convertGoalToDaily({ id, day: bucketKey });
    if (!res.ok) return res;
    const { sourceRow, rows, dailyItem } = res;
    return { ok: true, kind: "daily", sourceRow, rows, dailyItem };
  }
  const res = await moveGoalToLevel({ id, targetPeriod: targetLevel, targetPeriodKey: bucketKey });
  if (!res.ok) return res;
  return { ok: true, kind: "goal", row: res.row, rows: res.rows };
}

/* ------------------------------------------------------------------ */
/* Copy a goal to ANOTHER period WITHOUT moving it — the "Also add to…"  */
/* verb. Unlike moveGoalAcross (relocates / archives the source), this   */
/* leaves the original in place and creates an INDEPENDENT copy (source  */
/* = manual, no parent link, fresh progress) in the target bucket: so a  */
/* month goal can also live in a week while STILL living in the month.   */
/* year/quarter/month copy in-table; week → weekly_goals; day → the plan.*/
/* Numbers copy in FULL (no auto-divide, unlike Split).                  */
/* ------------------------------------------------------------------ */

const CopyToSchema = z.object({
  id: z.string().uuid(),
  targetLevel: z.enum(["year", "quarter", "month", "week", "day"]),
  /** year '2026' · quarter '2026-Q1' · month '2026-07' · week/day 'YYYY-MM-DD'. */
  targetKey: z.string().min(4).max(16),
  /** When true AND the copy crosses a level, link it as a CHILD of the source
   *  (roll-up) instead of an independent twin — the Kanban "drag a parent into a
   *  child lane" cascade (e.g. drag a Year goal onto a Quarter → a linked Q child). */
  asChild: z.boolean().optional(),
});

export type CopyGoalResult =
  | { ok: false; error: string }
  | { ok: true; kind: "goal"; row: GoalDTO }
  | { ok: true; kind: "weekly"; weeklyId: string }
  | { ok: true; kind: "daily"; dailyId: string };

export async function copyGoalToPeriod(
  input: z.infer<typeof CopyToSchema>,
): Promise<CopyGoalResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CopyToSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { targetLevel, targetKey } = parsed.data;

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  if (src.archived) return { ok: false, error: "That goal is archived." };

  // A COPY IS NOT A RE-HOME (Sir — "Copy to week" did nothing for anyone but an
  // admin).
  //
  // This used to demand `canRehomeLevel` for every cross-level copy, which is
  // `isAdmin || isManagerOfOwner` and — by design (lib/goals/policy.ts) — NEVER
  // true for the bare owner. So an employee opening their OWN Monthly Goals,
  // selecting their OWN goal and pressing "Copy to week" was refused with "Only
  // an admin or the owner's manager can move a goal across levels."
  //
  // Re-homing is structural because the goal LEAVES its level. Copying is not:
  // the source stays exactly where it is, no roll-up edge is created, and the
  // new weekly row is one the owner could type by hand on the Weekly board with
  // no gate at all. Gating it harder than the thing it is equivalent to only
  // removed a shortcut.
  //
  // The exception is `asChild`, which DOES create a parent→child roll-up edge —
  // that is structure, and keeps the original bar.
  if (targetLevel !== src.period) {
    const pol = await policyGate({ id: me.id, isAdmin }, src.employeeId);
    if (pol) {
      if (parsed.data.asChild) {
        if (!pol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };
      } else if (!pol.canCreateOwnChildren) {
        // Reachable only for a viewer who is neither the owner, their manager,
        // nor an admin — `loadWritableGoalRow` above has already turned away
        // anyone who may not write this goal at all.
        return { ok: false, error: POLICY_REASONS.copyLevel };
      }
    }
  }

  try {
    // ── year / quarter / month → a new goals row ──
    if (targetLevel === "year" || targetLevel === "quarter" || targetLevel === "month") {
      const position = await nextGoalPosition(src.employeeId, targetLevel, targetKey);
      const [row] = await db
        .insert(goals)
        .values({
          employeeId: src.employeeId,
          period: targetLevel,
          periodKey: targetKey,
          // Default = an independent twin (no roll-up). `asChild` on a cross-level
          // copy links it under the source (Kanban parent→child drag cascade).
          parentGoalId: parsed.data.asChild && targetLevel !== src.period ? src.id : null,
          position,
          scope: src.scope, // copy stays in the source's space
          area: src.area,
          title: src.title,
          uom: src.uom,
          targetQty: src.targetQty,
          targetAmount: src.targetAmount,
          actualQty: null, // fresh instance to work on
          actualAmount: null,
          notes: src.notes,
          teamInvolved: src.teamInvolved,
          teamDependencyPct: src.teamDependencyPct,
          weight: src.weight,
          incentiveEnabled: src.incentiveEnabled,
          incentiveAmount: src.incentiveAmount,
          incentiveKind: src.incentiveKind,
          monthlyMasterRef: src.monthlyMasterRef,
          category: src.category,
          pctDone: 0,
          status: "not_started",
          adopted: true,
          source: "manual",
          createdById: me.id,
          updatedById: me.id,
        })
        .returning();
      if (!row) return { ok: false, error: "Insert returned no row" };
      void logGoalActivity(row.id, GoalEventTypes.CascadeCreated, {
        employeeId: row.employeeId,
        goalKind: "cascade",
        detail: `copy of "${src.title}" → ${targetLevel} ${targetKey}`,
      }, me.id);
      revalidateGoals(src.periodKey, targetKey);
      return { ok: true, kind: "goal", row: toGoalDTO(row) };
    }

    // ── week → a weekly_goals row (independent: monthGoalId stays null) ──
    if (targetLevel === "week") {
      const weekStart = mondayOf(targetKey);
      const position = await nextWeeklyPosition(src.employeeId, weekStart);
      const [weeklyRow] = await db
        .insert(weeklyGoals)
        .values({
          employeeId: src.employeeId,
          weekStart,
          position,
          targetDone: src.title,
          area: src.area,
          uom: src.uom,
          targetQty: src.targetQty,
          targetAmount: src.targetAmount,
          actualQty: null,
          actualAmount: null,
          notes: src.notes,
          teamInvolved: src.teamInvolved,
          teamDependencyPct: src.teamDependencyPct,
          weight: src.weight,
          // ── CARRY THE REST OF THE GOAL ACROSS (Sir) ────────────────────
          // Every field below exists on BOTH tables and was silently dropped,
          // so a copied goal landed on the week stripped of the detail that
          // made it actionable. `delegatedTo` is the one that mattered most:
          // it is the DOER, and losing it handed the week a goal with nobody
          // on it.
          delegatedTo: src.delegatedTo,
          shareWithTeam: src.shareWithTeam,
          goalType: src.goalType,
          targetDate: src.targetDate,
          // "Part of Project?" travels as a SET (migration 0184) — the answer
          // plus the two ids that are only meaningful when it is yes.
          isProject: src.isProject,
          projectNodeId: src.projectNodeId,
          vendorId: src.vendorId,
          // Incentive crosses a TYPE boundary: goals.incentive_amount is
          // numeric(14,2) (a string in drizzle) while weekly_goals.incentive_amount
          // is a NOT-NULL integer. Round through Number and floor at 0 rather
          // than handing the driver a string it would reject.
          incentive: src.incentiveEnabled,
          incentiveAmount: Math.max(0, Math.round(Number(src.incentiveAmount ?? 0)) || 0),
          incentiveType: src.incentiveKind,
          // NOT copied, deliberately: actualQty/actualAmount/pctDone/status are
          // reset above (a copy is fresh work, not a record of work already
          // done), and evidenceUrl/acceptPct/reviewNotes belong to the source's
          // own review trail. `priority` has no counterpart on `goals` at all,
          // so the weekly row keeps its column default.
          pctDone: 0,
          status: "not_started",
          monthGoalId: null, // independent — no roll-up
          adopted: true,
          committedAt: null,
          approvedByManagerAt: null,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning();
      if (!weeklyRow) return { ok: false, error: "Insert returned no row" };
      // Provenance (0144, guarded) — audit only, not a functional link.
      try {
        await db.execute(
          sql`update weekly_goals set converted_from_goal_id = ${src.id}::uuid where id = ${weeklyRow.id}::uuid`,
        );
      } catch {
        // 0144 unapplied — never fatal.
      }
      void logGoalActivity(src.id, GoalEventTypes.CascadeEdited, {
        employeeId: src.employeeId,
        goalKind: "cascade",
        detail: `copied ${src.period} ${src.periodKey} → week ${weekStart}`,
      }, me.id);
      revalidateGoals(src.periodKey);
      revalidatePath("/goals/weekly");
      return { ok: true, kind: "weekly", weeklyId: weeklyRow.id };
    }

    // ── day → a standalone daily_checklist commitment (independent) ──
    const day = targetKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "Invalid day." };
    const [agg] = await db
      .select({
        count: sql<number>`count(*)::int`,
        max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
      })
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, src.employeeId), eq(dailyChecklist.planDate, day)));
    if ((agg?.count ?? 0) >= MAX_DAILY_ITEMS) {
      return { ok: false, error: `That day already has ${MAX_DAILY_ITEMS} planned items.` };
    }
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: src.employeeId,
        planDate: day,
        origin: "standalone",
        title: src.title,
        subject: src.area,
        position: (agg?.max ?? 0) + 1,
      })
      .returning(DAILY_ITEM_RETURNING);
    if (!row) return { ok: false, error: "Insert returned no row" };
    void logGoalActivity(src.id, GoalEventTypes.CascadeEdited, {
      employeeId: src.employeeId,
      goalKind: "cascade",
      detail: `copied ${src.period} ${src.periodKey} → day ${day}`,
    }, me.id);
    revalidateGoals(src.periodKey);
    return { ok: true, kind: "daily", dailyId: row.id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Promote a card UP a level (combined "Levels" board, Sir) — weekly →  */
/* month/quarter/year, or a month/quarter goal → a higher level. The    */
/* card "travels along": it changes level to the OWNING ancestor period.*/
/* ------------------------------------------------------------------ */

const LEVEL_RANK = { year: 0, quarter: 1, month: 2 } as const;
type PromoteLevel = keyof typeof LEVEL_RANK;

const PromoteSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["goal", "weekly"]),
  level: z.enum(["year", "quarter", "month"]),
});

/** The target period key at `level` that OWNS a source month key. */
function ownerKey(monthKey: string, level: PromoteLevel): string {
  if (level === "month") return monthKey;
  if (level === "quarter") return quarterKeyOfMonthKey(monthKey);
  return String(fyStartYearOfMonthKey(monthKey));
}

export async function promoteToLevel(
  input: z.infer<typeof PromoteSchema>,
): Promise<ActionResult<{ rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = PromoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, kind, level } = parsed.data;

  try {
    if (kind === "weekly") {
      // Weekly leaf → a goal at the target level (promote up, then remove the leaf).
      const [w] = await db
        .select({
          id: weeklyGoals.id,
          employeeId: weeklyGoals.employeeId,
          weekStart: weeklyGoals.weekStart,
          subject: weeklyGoals.subject,
          targetDone: weeklyGoals.targetDone,
          client: weeklyGoals.client,
          area: weeklyGoals.area,
          uom: weeklyGoals.uom,
          pctDone: weeklyGoals.pctDone,
          weight: weeklyGoals.weight,
        })
        .from(weeklyGoals)
        .where(eq(weeklyGoals.id, id))
        .limit(1);
      if (!w) return { ok: false, error: "Weekly goal not found." };
      const scope = await goalScopeFor({ id: me.id, isAdmin });
      if (!(w.employeeId === me.id || canManageGoalFor(scope, w.employeeId))) {
        return { ok: false, error: "That goal isn't yours." };
      }
      // Option A — promoting a weekly leaf INTO the goals table is a cross-level
      // re-home (structure): same gate as moveGoalToLevel, no bypass.
      const wPol = await policyGate({ id: me.id, isAdmin }, w.employeeId);
      if (wPol && !wPol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };
      const targetKey = ownerKey(w.weekStart.slice(0, 7), level);
      const position = await nextGoalPosition(w.employeeId, level, targetKey);
      // bug #22 — RETURN the created goal row through the rows-reconcile path
      // so the promoted card doesn't snap back while revalidation is in flight.
      const [created] = await db
        .insert(goals)
        .values({
          employeeId: w.employeeId,
          period: level,
          periodKey: targetKey,
          parentGoalId: null,
          position,
          area: w.area,
          title: w.targetDone?.trim() || w.subject?.trim() || w.client?.trim() || "Goal",
          uom: w.uom,
          pctDone: w.pctDone,
          weight: w.weight,
          source: "manual",
          category: "goal",
          createdById: me.id,
          updatedById: me.id,
        })
        .returning();
      await db.update(weeklyGoals).set({ archived: true, updatedAt: new Date() }).where(eq(weeklyGoals.id, id));
      revalidateGoals(targetKey);
      return { ok: true, rows: created ? [toGoalDTO(created)] : [] };
    }

    // A cascade goal → a HIGHER level (year/quarter/month). No-op / reject if the
    // target isn't strictly higher (demote is ambiguous — a year owns 12 months).
    const loaded = await loadWritableGoalRow(id, { id: me.id, isAdmin });
    if (!loaded.ok) return loaded;
    const row = loaded.row;
    const srcRank = LEVEL_RANK[row.period as PromoteLevel] ?? 2;
    if (LEVEL_RANK[level] >= srcRank) {
      return { ok: false, error: "Drop a card onto a HIGHER level to promote it." };
    }
    // Option A — promoting up a level is a cross-level re-home (structure).
    const gPol = await policyGate({ id: me.id, isAdmin }, row.employeeId);
    if (gPol && !gPol.canRehomeLevel) return { ok: false, error: POLICY_REASONS.rehomeLevel };
    const monthKeyForOwner =
      row.period === "month"
        ? row.periodKey
        : row.period === "quarter"
          ? `${fyStartYearOfKey(row.periodKey)}-04` // any month of that FY resolves the year
          : `${row.periodKey}-04`;
    const targetKey =
      level === "year"
        ? String(fyStartYearOfMonthKey(monthKeyForOwner))
        : level === "quarter"
          ? quarterKeyOfMonthKey(monthKeyForOwner)
          : row.periodKey;
    // bug #22 — same contract: the mutated row reconciles the optimistic patch.
    const [promoted] = await db
      .update(goals)
      .set({ period: level, periodKey: targetKey, parentGoalId: null, source: "manual", updatedById: me.id, updatedAt: new Date() })
      .where(eq(goals.id, id))
      .returning();
    revalidateGoals(row.periodKey, targetKey);
    return { ok: true, rows: promoted ? [toGoalDTO(promoted)] : [] };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveGoal(
  input: z.infer<typeof IdSchema>,
): Promise<ActionResult<{ row: GoalDTO }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  // Option A — archiving SOMEONE ELSE'S goal is structure. (loadWritableGoalRow
  // already restricts others' rows to admin/manager; this is the explicit
  // policy choke-point so the rule reads in one place.)
  if (loaded.row.employeeId !== me.id) {
    const pol = await policyGate({ id: me.id, isAdmin }, loaded.row.employeeId);
    if (pol && !pol.canDeleteOthers) return { ok: false, error: POLICY_REASONS.deleteOthers };
  }

  const [row] = await db
    .update(goals)
    .set({ archived: true, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "Goal not found" };
  void logGoalActivity(row.id, GoalEventTypes.CascadeArchived, {
    employeeId: row.employeeId,
    goalKind: "cascade",
    detail: row.title,
  }, me.id);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, row: toGoalDTO(row) };
}

/* ------------------------------------------------------------------ */
/* Reorder — persist a drag-reorder of cascade goals (design §3.4).    */
/* Clone of `reorderPlan` (plan/actions.ts): ONE statement, position =  */
/* index in the supplied array, hard-scoped to rows the caller may      */
/* write (one owner per call; self or managed downline).                */
/* ------------------------------------------------------------------ */

const MAX_REORDER_IDS = 200;

export async function reorderGoals(
  orderedIds: string[],
): Promise<ActionResult<{ rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ids = z.array(z.string().uuid()).max(MAX_REORDER_IDS).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };
  if (ids.data.length === 0) return { ok: true, rows: [] };

  try {
    // All rows must belong to ONE person the caller can write for — the same
    // authority model as loadWritableGoalRow, checked once for the batch.
    const owners = await db
      .select({ employeeId: goals.employeeId })
      .from(goals)
      .where(inArray(goals.id, ids.data));
    if (owners.length === 0) return { ok: true, rows: [] };
    const empIds = [...new Set(owners.map((o) => o.employeeId))];
    if (empIds.length > 1) {
      return { ok: false, error: "Reorder one person's goals at a time." };
    }
    const ownerId = empIds[0]!;
    if (ownerId !== me.id && !isAdmin) {
      const scope = await goalScopeFor({ id: me.id, isAdmin });
      if (!canManageGoalFor(scope, ownerId)) {
        return { ok: false, error: "Those goals aren't yours to reorder." };
      }
    }

    // One statement: position = index in the supplied array, scoped to owner.
    await db.execute(sql`
      update ${goals} g
      set position = o.ord, updated_at = now(), updated_by_id = ${me.id}
      from (
        select id, ord::int as ord
        from unnest(${sql`array[${sql.join(
          ids.data.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`}) with ordinality as t(id, ord)
      ) o
      where g.id = o.id
        and g.employee_id = ${ownerId}
    `);
    // bug #22 — return the renumbered rows through the rows-reconcile path so a
    // drag-reorder doesn't snap back on slow networks (the bare {ok:true} left
    // the optimistic positions to be reverted by the next base payload).
    const rows = await db
      .select()
      .from(goals)
      .where(and(eq(goals.employeeId, ownerId), inArray(goals.id, ids.data)));
    revalidateGoals();
    return { ok: true, rows: rows.map(toGoalDTO) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Redistribute children — the "Rebalance ▸" commit (design §3.2/§3.4).*/
/* Applies a suggestDistribution() preview: one atomic multi-row target */
/* update across a parent's direct children. This is the goals module's */
/* FIRST db.transaction() — a partial redistribute would corrupt the    */
/* allocation invariant (Σ children = parent target), so all rows land  */
/* or none do. Targets only — pctDone/acceptPct are NEVER touched (the  */
/* rollup stays a derived, labeled projection; locked decision 1).      */
/* ------------------------------------------------------------------ */

const RedistributeSchema = z.object({
  parentId: z.string().uuid(),
  distribution: z
    .array(
      z.object({
        id: z.string().uuid(),
        /** New numeric target (the child's own basis: qty when it has a qty
         *  target, else ₹ amount) — 2-dp money, ≥ 0. */
        target: z.number().min(0).max(999_999_999_999),
      }),
    )
    .min(1)
    .max(60),
});

export async function redistributeChildren(
  input: z.infer<typeof RedistributeSchema>,
): Promise<ActionResult<{ rows: GoalDTO[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RedistributeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const ids = d.distribution.map((x) => x.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Duplicate goals in the rebalance." };
  }

  // Authorise on the PARENT — children inherit its employee, and writing the
  // parent's plan is exactly what a redistribute is.
  const loaded = await loadWritableGoalRow(d.parentId, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const parent = loaded.row;

  // Option A — applying a redistribute rewrites the plan's structure across
  // the whole child set: admin/manager only.
  const pol = await policyGate({ id: me.id, isAdmin }, parent.employeeId);
  if (pol && !pol.canRebalance) return { ok: false, error: POLICY_REASONS.rebalance };

  // Every id must be a DIRECT child of that parent (no cross-tree writes).
  const children = await db
    .select()
    .from(goals)
    .where(and(eq(goals.parentGoalId, d.parentId), inArray(goals.id, ids)));
  if (children.length !== ids.length) {
    return { ok: false, error: "Rebalance includes goals that aren't children of this one." };
  }
  const childById = new Map(children.map((c) => [c.id, c]));

  // Each child must carry a numeric basis to receive a numeric target —
  // unmeasured (free-text) rows are excluded client-side (locked decision 3)
  // and refused here so we never invent a measure the owner didn't set.
  for (const { id } of d.distribution) {
    const c = childById.get(id)!;
    const qty = Number(c.targetQty);
    const amt = Number(c.targetAmount);
    if (!(Number.isFinite(qty) && qty > 0) && !(Number.isFinite(amt) && amt > 0)) {
      return { ok: false, error: `"${c.title}" has no numeric target to rebalance.` };
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const out: (typeof goals.$inferSelect)[] = [];
      for (const { id, target } of d.distribution) {
        const c = childById.get(id)!;
        const qty = Number(c.targetQty);
        const qtyBasis = Number.isFinite(qty) && qty > 0;
        const [row] = await tx
          .update(goals)
          .set({
            ...(qtyBasis ? { targetQty: target.toFixed(2) } : { targetAmount: target.toFixed(2) }),
            updatedById: me.id,
            updatedAt: new Date(),
          })
          .where(eq(goals.id, id))
          .returning();
        if (!row) throw new Error("A goal vanished mid-rebalance - nothing was changed.");
        out.push(row);
      }
      return out;
    });

    void logGoalActivity(parent.id, GoalEventTypes.CascadeRebalanced, {
      employeeId: parent.employeeId,
      goalKind: "cascade",
      detail: `${updated.length} child target${updated.length === 1 ? "" : "s"} rebalanced`,
    }, me.id);
    revalidateGoals(parent.periodKey);
    return { ok: true, rows: updated.map(toGoalDTO) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Goal Area / Measure lookups — admin-extensible dropdown options.     */
/* Base options live in lib/goals/lookups.ts; ADMINS can add more here  */
/* (persisted in goal_lookups, mig 0148) so they appear for everyone.   */
/* ------------------------------------------------------------------ */

const AddLookupSchema = z.object({
  kind: z.enum(["area", "measure", "type", "goaltype"]),
  value: z.string().trim().min(1, "Enter a value").max(60),
});

/** Read-only fetch of the Area/Measure/Type/Goal-Type dropdown options (base +
 *  admin-added) — for client components with no server-rendered board loader
 *  of their own (e.g. the standalone /goals/[id] detail page). */
export async function getGoalLookups(): Promise<ActionResult<{ options: GoalLookupOptions }>> {
  await requireGoalsAccess();
  return { ok: true, options: await listGoalLookups() };
}

/** Read-only fetch of the active-employee roster ({id,name}) — same list the
 *  Team/Delegate pickers use elsewhere, for client components with no
 *  server-rendered board loader of their own. */
export async function getGoalsRoster(): Promise<ActionResult<{ roster: RosterMember[] }>> {
  await requireGoalsAccess();
  return { ok: true, roster: await listEmployeeOptions() };
}

export async function addGoalLookup(
  input: z.infer<typeof AddLookupSchema>,
): Promise<ActionResult<{ options: GoalLookupOptions }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!isAdmin) return { ok: false, error: "Only admins can add options." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddLookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { kind, value } = parsed.data;
  const v = value.trim();

  // If a row already exists (case-insensitive), reactivate it — this also
  // UN-HIDES a base option an admin removed earlier. An already-active base with
  // no row is a no-op; otherwise insert the new custom option.
  const [existing] = await db
    .select({ id: goalLookups.id, active: goalLookups.active })
    .from(goalLookups)
    .where(and(eq(goalLookups.kind, kind), sql`lower(${goalLookups.value}) = ${v.toLowerCase()}`))
    .limit(1);
  if (existing) {
    if (!existing.active) await db.update(goalLookups).set({ active: true }).where(eq(goalLookups.id, existing.id));
  } else if (!isBaseGoalLookup(kind, v)) {
    try {
      await db.insert(goalLookups).values({ kind, value: v, createdById: me.id });
    } catch {
      // Race — fine, fall through.
    }
  }
  void goalLookupExists;
  revalidateGoals();
  return { ok: true, options: await listGoalLookups() };
}

const RemoveLookupSchema = z.object({
  kind: z.enum(["area", "measure", "type", "goaltype"]),
  value: z.string().trim().min(1).max(60),
});

/** Remove an option. An admin-added one is soft-deleted; a BUILT-IN one is
 *  HIDDEN via an inactive marker row (the value keeps working on existing goals
 *  but leaves the picker). Admins-only. Re-add un-hides it. */
export async function removeGoalLookup(
  input: z.infer<typeof RemoveLookupSchema>,
): Promise<ActionResult<{ options: GoalLookupOptions }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!isAdmin) return { ok: false, error: "Only admins can remove options." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RemoveLookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { kind, value } = parsed.data;
  const v = value.trim();

  const [existing] = await db
    .select({ id: goalLookups.id })
    .from(goalLookups)
    .where(and(eq(goalLookups.kind, kind), sql`lower(${goalLookups.value}) = ${v.toLowerCase()}`))
    .limit(1);
  if (existing) {
    await db.update(goalLookups).set({ active: false }).where(eq(goalLookups.id, existing.id));
  } else if (isBaseGoalLookup(kind, v)) {
    // Built-in with no row yet → insert an inactive "hidden" marker.
    await db.insert(goalLookups).values({ kind, value: v, active: false, createdById: me.id });
  }
  revalidateGoals();
  return { ok: true, options: await listGoalLookups() };
}

/* ================================================================== */
/* BULK actions + Yearly auto-divide + goals Recycle-Bin restore/purge */
/* ================================================================== */

const IdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** Bulk soft-delete (→ recycle bin). Reuses archiveGoal's per-row auth. */
export async function bulkArchiveGoals(
  input: z.infer<typeof IdsSchema>,
): Promise<ActionResult<{ archived: number }>> {
  const parsed = IdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  let n = 0;
  let lastErr = "";
  for (const id of parsed.data.ids) {
    const r = await archiveGoal({ id });
    if (r.ok) n++;
    else lastErr = r.error;
  }
  if (n === 0) return { ok: false, error: lastErr || "Nothing was deleted." };
  return { ok: true, archived: n };
}

const BulkShareSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  shareWithTeam: z.boolean(),
  teamInvolved: TeamIn,
  teamDependencyPct: z.number().int().min(0).max(100).nullish(),
});

/** Bulk "Share with team" (+ optional members / participation %). */
export async function bulkSetShareWithTeam(
  input: z.infer<typeof BulkShareSchema>,
): Promise<ActionResult<{ updated: number }>> {
  const parsed = BulkShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;
  let n = 0;
  for (const id of d.ids) {
    const r = await editGoal({
      id,
      shareWithTeam: d.shareWithTeam,
      ...(d.teamInvolved !== undefined ? { teamInvolved: d.teamInvolved } : {}),
      ...(d.teamDependencyPct !== undefined ? { teamDependencyPct: d.teamDependencyPct } : {}),
    });
    if (r.ok) n++;
  }
  if (n === 0) return { ok: false, error: "Nothing was updated." };
  return { ok: true, updated: n };
}

/** Titles already present in a destination CHILD period — powers copy
 *  dup-collision (year/quarter/month live in `goals`; week → weekly_goals;
 *  day → daily_checklist). Case is preserved; the caller normalises. */
async function existingTitlesInPeriod(
  employeeId: string,
  targetLevel: "year" | "quarter" | "month" | "week" | "day",
  targetKey: string,
): Promise<string[]> {
  if (targetLevel === "year" || targetLevel === "quarter" || targetLevel === "month") {
    const rows = await db
      .select({ title: goals.title })
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, employeeId),
          eq(goals.period, targetLevel),
          eq(goals.periodKey, targetKey),
          eq(goals.archived, false),
        ),
      );
    return rows.map((r) => r.title);
  }
  if (targetLevel === "week") {
    const weekStart = mondayOf(targetKey);
    const rows = await db
      .select({ title: weeklyGoals.targetDone })
      .from(weeklyGoals)
      .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)));
    return rows.map((r) => r.title).filter((t): t is string => !!t);
  }
  const rows = await db
    .select({ title: dailyChecklist.title })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, targetKey)));
  return rows.map((r) => r.title).filter((t): t is string => !!t);
}

/** Remove a destination period's goals whose title matches one of `titles`
 *  (case-insensitive) — the "Replace" arm of a copy dup-collision. Goals-table
 *  rows are soft-archived (recoverable); week/day rows are hard-deleted (they
 *  carry no archive column). */
async function removeMatchingInPeriod(
  employeeId: string,
  targetLevel: "year" | "quarter" | "month" | "week" | "day",
  targetKey: string,
  titles: Set<string>,
): Promise<void> {
  const norm = (t: string | null) => (t ?? "").trim().toLowerCase();
  if (targetLevel === "year" || targetLevel === "quarter" || targetLevel === "month") {
    const rows = await db
      .select({ id: goals.id, title: goals.title })
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, employeeId),
          eq(goals.period, targetLevel),
          eq(goals.periodKey, targetKey),
          eq(goals.archived, false),
        ),
      );
    const hit = rows.filter((r) => titles.has(norm(r.title))).map((r) => r.id);
    if (hit.length) {
      await db
        .update(goals)
        .set({ archived: true, updatedAt: new Date() })
        .where(inArray(goals.id, hit));
    }
    return;
  }
  if (targetLevel === "week") {
    const weekStart = mondayOf(targetKey);
    const rows = await db
      .select({ id: weeklyGoals.id, title: weeklyGoals.targetDone })
      .from(weeklyGoals)
      .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)));
    const hit = rows.filter((r) => titles.has(norm(r.title))).map((r) => r.id);
    if (hit.length) await db.delete(weeklyGoals).where(inArray(weeklyGoals.id, hit));
    return;
  }
  const rows = await db
    .select({ id: dailyChecklist.id, title: dailyChecklist.title })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, targetKey)));
  const hit = rows.filter((r) => titles.has(norm(r.title))).map((r) => r.id);
  if (hit.length) await db.delete(dailyChecklist).where(inArray(dailyChecklist.id, hit));
}

const DetectCollisionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  targetLevel: z.enum(["year", "quarter", "month", "week", "day"]),
  /** Candidate destination CHILD period keys (up to a month's worth of days). */
  targetKeys: z.array(z.string().min(4).max(16)).min(1).max(31),
});

/**
 * For a set of selected goals + candidate destination CHILD periods, return
 * which destination keys already hold a goal with the SAME title. Drives the
 * "Copy to" dup-collision prompt (Skip / Replace / Cancel) on the client.
 */
export async function detectCopyCollisions(
  input: z.infer<typeof DetectCollisionSchema>,
): Promise<ActionResult<{ collisions: Record<string, string[]> }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const parsed = DetectCollisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { ids, targetLevel, targetKeys } = parsed.data;

  const srcRows = await db
    .select({ title: goals.title, employeeId: goals.employeeId })
    .from(goals)
    .where(inArray(goals.id, ids));
  const employeeId = srcRows[0]?.employeeId; // one board = one owner
  if (!employeeId) return { ok: true, collisions: {} };
  // Scope: only reveal colliding titles for a board the caller actually manages
  // (was leaking a peer's goal titles for any client-supplied goal id).
  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(scope, employeeId)) return { ok: true, collisions: {} };
  const srcTitles = new Set(srcRows.map((r) => r.title.trim().toLowerCase()));

  const collisions: Record<string, string[]> = {};
  for (const key of targetKeys) {
    const existing = await existingTitlesInPeriod(employeeId, targetLevel, key);
    const dup = Array.from(
      new Set(existing.filter((t) => srcTitles.has(t.trim().toLowerCase()))),
    );
    if (dup.length) collisions[key] = dup;
  }
  return { ok: true, collisions };
}

const BulkCopySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  targetLevel: z.enum(["year", "quarter", "month", "week", "day"]),
  targetKey: z.string().min(4).max(16),
  /** Collision policy when the destination already holds a same-title goal:
   *  · undefined — SKIP (the safe default; see the note in the body)
   *  · "skip"    — don't copy the colliding source goals
   *  · "replace" — clear the destination's matching goals first, then copy
   *  · "keep-both" — copy anyway, duplicates and all. Must be asked for
   *    EXPLICITLY, so a duplicate is only ever created on purpose. */
  onDuplicate: z.enum(["skip", "replace", "keep-both"]).optional(),
});

/** Bulk copy goals into another CHILD period (reuses copyGoalToPeriod per row).
 *  Copies to the SAME child level+key the caller passes — the client derives the
 *  correct child level (year→quarter, quarter→month, month→week, week→day). */
export async function bulkCopyGoalsToPeriod(
  input: z.infer<typeof BulkCopySchema>,
): Promise<ActionResult<{ copied: number; skipped: number }>> {
  // AUTHZ (was MISSING): this jumped straight to the schema parse with no auth
  // and no ownership check, while its `onDuplicate:"replace"` branch HARD-DELETES
  // weekly_goals + daily_checklist rows for an employeeId taken from a
  // client-supplied goal id. Any employee could wipe another's plan. Gate it like
  // every sibling, and verify the caller may manage EVERY source goal's owner.
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = BulkCopySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const scope = await goalScopeFor({ id: me.id, isAdmin });
  // Resolve the source goals up front (all modes) and confirm ownership BEFORE
  // any copy/delete. A single unmanageable id fails the whole batch closed.
  const srcRows = await db
    .select({ id: goals.id, title: goals.title, employeeId: goals.employeeId })
    .from(goals)
    .where(inArray(goals.id, d.ids));
  if (srcRows.length === 0) return { ok: false, error: "Nothing was copied." };
  if (!srcRows.every((r) => canManageGoalFor(scope, r.employeeId))) {
    return { ok: false, error: "You can only copy goals you manage." };
  }

  let copyIds = d.ids;
  let skipped = 0;

  // NO ACCIDENTAL DUPLICATES (Sir). An unspecified policy now means SKIP, not
  // "copy anyway".
  //
  // The client detects collisions first and only omits the policy when it found
  // none — but that is a SEPARATE round trip, so a double-click, two open tabs,
  // or anything added to the destination in between could still land the same
  // goal on the same week twice. Re-checking here inside the write closes that
  // window; when the client was right it finds nothing and costs one query.
  // A deliberate duplicate is still possible — it just has to say "keep-both".
  const dupPolicy = d.onDuplicate ?? "skip";

  if (dupPolicy === "skip" || dupPolicy === "replace") {
    const employeeId = srcRows[0]?.employeeId;
    if (employeeId) {
      const existing = new Set(
        (await existingTitlesInPeriod(employeeId, d.targetLevel, d.targetKey)).map((t) =>
          t.trim().toLowerCase(),
        ),
      );
      if (dupPolicy === "skip") {
        const keep = srcRows.filter((r) => !existing.has(r.title.trim().toLowerCase()));
        copyIds = keep.map((r) => r.id);
        skipped = d.ids.length - copyIds.length;
      } else {
        const srcTitles = new Set(srcRows.map((r) => r.title.trim().toLowerCase()));
        await removeMatchingInPeriod(employeeId, d.targetLevel, d.targetKey, srcTitles);
      }
    }
  }

  let n = 0;
  for (const id of copyIds) {
    const r = await copyGoalToPeriod({ id, targetLevel: d.targetLevel, targetKey: d.targetKey });
    if (r.ok) n++;
  }
  if (n === 0 && skipped === 0) return { ok: false, error: "Nothing was copied." };
  return { ok: true, copied: n, skipped };
}

/**
 * Divide a YEARLY goal into 4 quarterly + 12 monthly children in one click —
 * equal weight, linked to the parent (source='cascade'). Numbers/uom/area/type
 * carry down; targets/actuals reset.
 */
export async function divideYearlyGoal(
  input: z.infer<typeof IdSchema>,
): Promise<ActionResult<{ created: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  if (src.period !== "year") {
    return { ok: false, error: "Only a yearly goal can be divided into quarters + months." };
  }

  const pol = await policyGate({ id: me.id, isAdmin }, src.employeeId);
  if (pol && !pol.canAutoDivide) return { ok: false, error: POLICY_REASONS.autoDivide };

  const fy = Number(src.periodKey);
  if (!Number.isFinite(fy)) return { ok: false, error: "Bad yearly period." };

  const baseCols = {
    employeeId: src.employeeId,
    area: src.area,
    title: src.title,
    uom: src.uom,
    category: src.category,
    goalType: src.goalType, // keep the parent's Goal Type on the divided children
    scope: src.scope, // divided children stay in the parent's space
    source: "cascade" as const,
    createdById: me.id,
    updatedById: me.id,
    adopted: true,
  };

  // Split the parent's Actual + Target across the children so they SUM back to
  // the year: each quarter gets ¼, each month 1⁄12. % Done rides on the same
  // Actual ÷ Target ratio, so every child inherits the parent's progress.
  const toN = (v: string | null): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const share = (v: number | null, by: number): string | null =>
    v == null ? null : String(Math.round((v / by) * 100) / 100);
  const srcT = toN(src.targetQty);
  const srcA = toN(src.actualQty);
  const dividedPct = autoPctDone(src.targetQty, src.actualQty);
  const pctCols = {
    pctDone: dividedPct ?? 0,
    status: (dividedPct != null ? statusForPct(dividedPct) : "not_started") as
      | "done"
      | "initiated"
      | "not_started",
  };

  let created = 0;
  try {
    for (const qKey of quartersOfFy(fy)) {
      const qPos = await nextGoalPosition(src.employeeId, "quarter", qKey);
      const [qRow] = await db
        .insert(goals)
        .values({
          ...baseCols,
          ...pctCols,
          period: "quarter",
          periodKey: qKey,
          parentGoalId: src.id,
          position: qPos,
          weight: 25,
          targetQty: share(srcT, 4),
          actualQty: share(srcA, 4),
        })
        .returning({ id: goals.id });
      if (!qRow) continue;
      created++;
      const q = Number(qKey.split("-Q")[1]) as 1 | 2 | 3 | 4;
      for (const mKey of monthKeysOfQuarter(fy, q)) {
        const mPos = await nextGoalPosition(src.employeeId, "month", mKey);
        const [mRow] = await db
          .insert(goals)
          .values({
            ...baseCols,
            ...pctCols,
            period: "month",
            periodKey: mKey,
            parentGoalId: qRow.id,
            position: mPos,
            weight: 8,
            targetQty: share(srcT, 12),
            actualQty: share(srcA, 12),
          })
          .returning({ id: goals.id });
        if (mRow) created++;
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  void logGoalActivity(
    src.id,
    GoalEventTypes.CascadeEdited,
    { employeeId: src.employeeId, goalKind: "cascade", detail: "divided year " + fy + " into " + created + " children" },
    me.id,
  );
  revalidateGoals(src.periodKey);
  return { ok: true, created };
}

/* Recycle bin (archived goals) — restore + permanent delete. */

/** Un-archive a goal (restore from the recycle bin). */
export async function restoreGoal(input: z.infer<typeof IdSchema>): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const [row] = await db.select().from(goals).where(eq(goals.id, parsed.data.id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found." };
  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(scope, row.employeeId)) return { ok: false, error: "Not allowed." };
  await db
    .update(goals)
    .set({ archived: false, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, row.id));
  revalidateGoals(row.periodKey);
  revalidatePath("/goals/recycle-bin");
  return { ok: true };
}

/** PERMANENTLY delete archived goals (recycle-bin hard delete). Only archived
 *  rows the viewer manages are removed; their children detach (FK set null). */
export async function purgeGoals(
  input: z.infer<typeof IdsSchema>,
): Promise<ActionResult<{ deleted: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const parsed = IdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const scope = await goalScopeFor({ id: me.id, isAdmin });

  const rows = await db
    .select({ id: goals.id, employeeId: goals.employeeId, archived: goals.archived })
    .from(goals)
    .where(inArray(goals.id, parsed.data.ids));
  const purgeable = rows
    .filter((r) => r.archived && canManageGoalFor(scope, r.employeeId))
    .map((r) => r.id);
  if (purgeable.length === 0) return { ok: false, error: "Nothing to delete." };
  await db.delete(goals).where(inArray(goals.id, purgeable));
  revalidatePath("/goals/recycle-bin");
  return { ok: true, deleted: purgeable.length };
}

/* ------------------------------------------------------------------ */
/* First-run: copy the admin's PROFESSIONAL goal tree into PERSONAL.    */
/* Only when their personal space is empty. Progress/actuals reset;     */
/* parent links remapped so the Y→Q→M cascade is preserved.             */
/* ------------------------------------------------------------------ */

export async function copyProfessionalToPersonal(): Promise<ActionResult<{ created: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!isAdmin) return { ok: false, error: "Only admins have a personal space." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Guard — only seed an EMPTY personal space.
  const [existing] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.employeeId, me.id), eq(goals.scope, "personal"), eq(goals.archived, false)))
    .limit(1);
  if (existing) return { ok: false, error: "Your personal space already has goals." };

  // Source: this admin's professional Y/Q/M goals.
  const src = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, me.id),
        eq(goals.scope, "professional"),
        eq(goals.archived, false),
        inArray(goals.period, ["year", "quarter", "month"]),
      ),
    );
  if (src.length === 0) return { ok: false, error: "You have no professional goals to copy." };

  try {
    // Pass 1 — insert copies (no parent link yet), building old→new id map.
    const idMap = new Map<string, string>();
    for (const g of src) {
      const [row] = await db
        .insert(goals)
        .values({
          employeeId: g.employeeId,
          period: g.period,
          periodKey: g.periodKey,
          parentGoalId: null,
          position: g.position,
          scope: "personal",
          area: g.area,
          title: g.title,
          uom: g.uom,
          targetQty: g.targetQty,
          targetAmount: g.targetAmount,
          actualQty: null,
          actualAmount: null,
          notes: g.notes,
          teamInvolved: g.teamInvolved,
          teamDependencyPct: g.teamDependencyPct,
          weight: g.weight,
          category: g.category,
          source: "manual",
          pctDone: 0,
          acceptPct: null,
          adopted: true,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: goals.id });
      if (row) idMap.set(g.id, row.id);
    }
    // Pass 2 — re-link parents inside the personal copy.
    for (const g of src) {
      if (!g.parentGoalId) continue;
      const newSelf = idMap.get(g.id);
      const newParent = idMap.get(g.parentGoalId);
      if (newSelf && newParent) {
        await db.update(goals).set({ parentGoalId: newParent }).where(eq(goals.id, newSelf));
      }
    }
    revalidateGoals();
    return { ok: true, created: idMap.size };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
