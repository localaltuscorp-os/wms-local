"use server";

import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { weeklyGoals, employees, tasks, incentiveCatalog } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  requireUser,
  requireWeeklyGoalsFilled,
} from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor, canManageGoalFor } from "@/lib/weekly-goals/hierarchy";
import { balanceWeightsToBudget, WEIGHT_BUDGET } from "@/lib/weekly-goals/effective";
import { mondayOf, nextWeekStart, weekEnd } from "@/lib/weekly-goals/week";
import { type TaskPriority } from "@/db/enums";
import { createTasksCore } from "@/lib/tasks/create-task";
import { syncGoalToTask } from "@/lib/weekly-goals/task-sync";
import { weeklyGoalTitle } from "@/lib/weekly-goals/as-task-row";
import {
  CreateWeeklyGoalSchema,
  type CreateWeeklyGoalInput,
  EditWeeklyGoalSchema,
  type EditWeeklyGoalInput,
  SetPctDoneSchema,
  type SetPctDoneInput,
  SetWeeklyGoalStatusSchema,
  type SetWeeklyGoalStatusInput,
  SetWeeklyGoalReportSchema,
  type SetWeeklyGoalReportInput,
  CarryOverSchema,
  type CarryOverInput,
  DeleteWeeklyGoalSchema,
  ReviewWeeklyGoalSchema,
  type ReviewWeeklyGoalInput,
  ApproveWeeklyGoalSchema,
  type ApproveWeeklyGoalInput,
  ArchiveWeeklyGoalSchema,
  type ArchiveWeeklyGoalInput,
  DuplicateWeeklyGoalSchema,
  type DuplicateWeeklyGoalInput,
} from "@/lib/validators/weekly-goal";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

function revalidateWeeklyGoals() {
  revalidatePath("/goals/weekly");
  revalidatePath("/goals/weekly/dashboard");
  updateTag(CACHE_TAGS.weeklyGoals);
}

/**
 * Phase 4 — normalise the structured incentive fields into the persisted shape.
 * Ad-hoc / One-time keep the manual amount; **Routine** always re-reads the
 * amount from the catalog server-side (the client never gets to set a Routine
 * amount), and `incentive` (bool) stays true whenever a type is chosen.
 */
async function resolveIncentiveFields(input: {
  incentiveType?: "adhoc" | "onetime" | "routine" | null;
  incentiveAmount?: number;
  incentiveCatalogId?: string | null;
}): Promise<{
  incentive: boolean;
  incentiveType: string | null;
  incentiveAmount: number;
  incentiveCatalogId: string | null;
}> {
  const type = input.incentiveType ?? null;
  if (!type) {
    return { incentive: false, incentiveType: null, incentiveAmount: 0, incentiveCatalogId: null };
  }
  if (type === "routine") {
    let amount = 0;
    let catalogId = input.incentiveCatalogId ?? null;
    if (catalogId) {
      const [cat] = await db
        .select({ amount: incentiveCatalog.amount })
        .from(incentiveCatalog)
        .where(eq(incentiveCatalog.id, catalogId));
      if (cat) amount = Math.round(Number(cat.amount));
      else catalogId = null;
    }
    return { incentive: true, incentiveType: "routine", incentiveAmount: amount, incentiveCatalogId: catalogId };
  }
  // adhoc | onetime → manual amount, no catalog link.
  return {
    incentive: true,
    incentiveType: type,
    incentiveAmount: Math.max(0, Math.round(input.incentiveAmount ?? 0)),
    incentiveCatalogId: null,
  };
}

/** Next Sr. No. for an (employee, week) — max(position)+1, 1-based. */
async function nextPosition(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int` })
    .from(weeklyGoals)
    .where(
      and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)),
    );
  return (row?.max ?? 0) + 1;
}

/**
 * Fetch a goal + decide whether the signed-in user may write it.
 * Owners (the goal's employee), admins, and managers (for any goal owned by
 * someone in their full downline) may edit; nobody else.
 */
type LoadResult =
  | { ok: false; error: string }
  | { ok: true; row: typeof weeklyGoals.$inferSelect };

async function loadWritableGoal(
  id: string,
  me: { id: string; isAdmin: boolean },
): Promise<LoadResult> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  // Admins → anyone. Owners → their own. Managers → their downline.
  if (me.isAdmin || row.employeeId === me.id) return { ok: true, row };
  const scope = await goalScopeFor(me);
  if (scope.ids.includes(row.employeeId)) return { ok: true, row };
  return { ok: false, error: "You can only edit your own weekly goals" };
}

/**
 * Load a goal and require that the signed-in user is a MANAGER of it — i.e. the
 * goal's owner is NOT themselves AND they have authority over that owner
 * (`me.isAdmin`, or the owner is in their downline scope). A person is NEVER a
 * manager of their own goal. This is the security gate for every planning-field
 * mutation, duplicate, delete, balance + incentive write — owners are rejected.
 */
async function loadManageableGoal(
  id: string,
  me: { id: string; isAdmin: boolean; email: string },
): Promise<LoadResult> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  // The single "manager tier" gate for EVERY privileged write (planning edits,
  // delete, duplicate, incentive, balance, AND review/approve/archive): an admin
  // or super-admin (org-wide), or the owner's manager (downline, never self). A
  // person is NEVER a manager of their own goal, so doers are always rejected.
  const scope = await goalScopeFor(me);
  const isManager =
    me.isAdmin ||
    isSuperAdmin(me.email) ||
    (row.employeeId !== me.id && scope.ids.includes(row.employeeId));
  if (!isManager) return { ok: false, error: "Only a manager or admin can do that" };
  return { ok: true, row };
}

/**
 * Create one weekly-goal row. Non-admins can only file goals against
 * themselves; admins can file against anyone. The week is snapped to its
 * Monday defensively. Used by the fast-add row (one submit = one priority).
 */
/** Hard ceiling on goals per person per week (Phase-1 rule). */
const MAX_GOALS_PER_WEEK = 10;

/**
 * Re-balance one person's ACTIVE goals for a week so their weights total EXACTLY
 * 100 (proportional to the weights already entered; even split when none). Silent
 * + idempotent — only rows whose weight actually changes are written. This is the
 * enforcement behind "weights must always total 100": it runs after every add and
 * delete so a person's week is never off-budget.
 */
async function rebalanceWeekWeights(
  employeeId: string,
  weekStart: string,
  actorId: string,
): Promise<void> {
  const rows = await db
    .select({ id: weeklyGoals.id, weight: weeklyGoals.weight })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
      ),
    );
  if (rows.length === 0) return;
  const balanced = balanceWeightsToBudget(rows);
  for (const r of rows) {
    const next = balanced.get(r.id);
    if (next == null || next === r.weight) continue;
    await db
      .update(weeklyGoals)
      .set({ weight: next, updatedById: actorId, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, r.id));
  }
}

/** Count a person's active (non-archived) goals in a week. */
async function activeGoalCount(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
      ),
    );
  return row?.n ?? 0;
}

export async function createWeeklyGoal(
  input: CreateWeeklyGoalInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  // NOTE: the old "fill your existing goals before you can add new ones" gate was
  // removed here — it blocked managers from planning team goals (and anyone from
  // adding a goal) whenever they had an unfilled goal of their own. Daily filling
  // is now enforced by the compulsory post-login gate instead, so this
  // create-time block was redundant and only got in the way.
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Scope enforcement: admins target anyone; managers target themselves or
  // their full downline; everyone else only themselves (self is always in scope).
  const scope = await goalScopeFor(me);
  if (!canManageGoalFor(scope, data.employeeId)) {
    return { ok: false, error: "You can only create goals for yourself or your team." };
  }
  const employeeId = data.employeeId;
  const weekStart = mondayOf(data.weekStart);

  // Hard cap: no more than 10 goals per person per week.
  if ((await activeGoalCount(employeeId, weekStart)) >= MAX_GOALS_PER_WEEK) {
    return { ok: false, error: `That's the weekly maximum — up to ${MAX_GOALS_PER_WEEK} goals per week.` };
  }

  try {
    const position = await nextPosition(employeeId, weekStart);
    const inc = await resolveIncentiveFields(data);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId,
        weekStart,
        position,
        client: data.client,
        subject: data.subject,
        priority: data.priority,
        incentive: inc.incentive,
        incentiveType: inc.incentiveType,
        incentiveAmount: inc.incentiveAmount,
        incentiveCatalogId: inc.incentiveCatalogId,
        kpi: data.kpi,
        targetDone: data.targetDone,
        explanation: data.explanation,
        linkUrl: data.linkUrl,
        weight: data.weight,
        targetDate: data.targetDate,
        notes: data.notes,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    // Enforce the 100-point budget: re-balance the whole week after the add.
    await rebalanceWeekWeights(employeeId, weekStart, me.id);
    revalidateWeeklyGoals();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Edit a goal's content fields (client/subject/priority/flags/notes). */
export async function editWeeklyGoal(
  input: EditWeeklyGoalInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = EditWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...fields } = parsed.data;

  // Planning fields are manager-only (#5): owners may never edit weight / target
  // date / incentive / client / subject / goal text.
  const loaded = await loadManageableGoal(id, me);
  if (!loaded.ok) return loaded;

  // Only write the keys actually provided so a partial edit doesn't clobber.
  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  const incentiveKeys = ["incentiveType", "incentiveAmount", "incentiveCatalogId"];
  for (const [k, v] of Object.entries(fields)) {
    if (incentiveKeys.includes(k)) continue; // handled together below
    if (v !== undefined) patch[k] = v;
  }
  // Phase 4 — when the edit touches incentive at all, recompute the whole trio
  // (type/amount/catalog + the bool) server-side so Routine amounts stay
  // catalog-authoritative and clearing the type wipes the amount.
  if (incentiveKeys.some((k) => k in fields)) {
    const inc = await resolveIncentiveFields(fields);
    patch.incentive = inc.incentive;
    patch.incentiveType = inc.incentiveType;
    patch.incentiveAmount = inc.incentiveAmount;
    patch.incentiveCatalogId = inc.incentiveCatalogId;
  }

  try {
    await db.update(weeklyGoals).set(patch).where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Set "% Done (Actual)". Owner enters it; admin (Manan) can overwrite. We
 * snapshot who moved it + when so the dashboard can show provenance.
 */
export async function setWeeklyGoalPct(
  input: SetPctDoneInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = SetPctDoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid percentage" };
  }
  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    await db
      .update(weeklyGoals)
      .set({
        pctDone: parsed.data.pctDone,
        pctUpdatedById: me.id,
        pctUpdatedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, parsed.data.id));
    // Phase 2 — if this goal has a linked task, mirror the new % onto it.
    await syncGoalToTask(parsed.data.id);
    revalidateWeeklyGoals();
    revalidatePath("/tasks");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Set a goal's `status` — the OWNER (doer) or a manager may move it through the
 * regular non-approval statuses (USER_TASK_STATUSES). The approval verdicts
 * (approved / not_approved / …) stay manager-only via the super-admin review
 * panel. Reuses the owner+manager `loadWritableGoal` permission gate.
 */
export async function setWeeklyGoalStatus(
  input: SetWeeklyGoalStatusInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = SetWeeklyGoalStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status" };
  }
  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    await db
      .update(weeklyGoals)
      .set({
        status: parsed.data.status,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, parsed.data.id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Owner progress REPORT — the doer (or a manager) records their narrative:
 * `explanation` (what they did) + `linkUrl` (evidence the reviewer reads). These
 * are the only content fields a normal employee may write on their own goal,
 * besides % (setWeeklyGoalPct) and status (setWeeklyGoalStatus). Planning fields
 * (weight / target date / incentive / client / subject / goal) stay manager-only
 * via editWeeklyGoal. Owner-or-manager gate (loadWritableGoal).
 */
export async function setWeeklyGoalReport(
  input: SetWeeklyGoalReportInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = SetWeeklyGoalReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, explanation, linkUrl } = parsed.data;
  const loaded = await loadWritableGoal(id, me);
  if (!loaded.ok) return loaded;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  if (explanation !== undefined) patch.explanation = explanation;
  if (linkUrl !== undefined) patch.linkUrl = linkUrl;

  try {
    await db.update(weeklyGoals).set(patch).where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Phase 2 — "Add to Tasks". Spin a real, tracked Task off a Weekly Goal so the
 * commitment lives in the doer's task list (and on their calendar) instead of
 * WhatsApp. One goal ⇄ one task: idempotent, returns the existing link if the
 * goal already has a live task. The task is auto-prioritised **Important**
 * (`imp_not_urgent`, design §1 — goal-derived work is important-not-urgent) and
 * two-way %/done sync runs through the link thereafter (task-sync.ts).
 */
export async function createTaskFromGoal(
  input: { goalId: string },
): Promise<ActionResult<{ taskId: string; taskNo: number | null; alreadyLinked: boolean }>> {
  const me = await requireUser();
  if (!input?.goalId || typeof input.goalId !== "string") {
    return { ok: false, error: "Missing goal" };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const loaded = await loadWritableGoal(input.goalId, me);
  if (!loaded.ok) return loaded;
  const goal = loaded.row;

  // Idempotent: if the goal already points at a live (non-archived) task, just
  // return it. A dangling link (task deleted → FK set null) falls through to a
  // fresh create.
  if (goal.taskId) {
    const [existing] = await db
      .select({ id: tasks.id, taskNo: tasks.taskNo, archived: tasks.archived })
      .from(tasks)
      .where(eq(tasks.id, goal.taskId));
    if (existing && !existing.archived) {
      return { ok: true, taskId: existing.id, taskNo: existing.taskNo, alreadyLinked: true };
    }
  }

  const dueDate = goal.targetDate ?? weekEnd(goal.weekStart);
  const title = weeklyGoalTitle(goal);

  try {
    const created = await createTasksCore(
      { id: me.id, name: me.name },
      {
        title,
        doerId: goal.employeeId,
        initiatorId: me.id,
        priority: "imp_not_urgent",
        dueAt: new Date(`${dueDate}T12:00:00`).toISOString(),
        subject: goal.subject,
        description: goal.targetDone,
        notes: goal.explanation,
      },
    );
    if (!created.ok) return { ok: false, error: created.error };
    const taskId = created.id;

    // Stamp provenance + the goal's real client (createTasksCore mirrors client
    // from title), then wire the goal → task link.
    await db
      .update(tasks)
      .set({ originGoalId: goal.id, client: goal.client })
      .where(eq(tasks.id, taskId));
    await db
      .update(weeklyGoals)
      .set({ taskId, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, goal.id));

    // Seed the task status from the goal's current % (a goal already at 100%
    // creates a done task; partial → in progress).
    await syncGoalToTask(goal.id);

    revalidateWeeklyGoals();
    revalidatePath("/tasks");
    const [row] = await db.select({ taskNo: tasks.taskNo }).from(tasks).where(eq(tasks.id, taskId));
    return { ok: true, taskId, taskNo: row?.taskNo ?? null, alreadyLinked: false };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Carry a goal forward into a later week WITHOUT touching the original — used
 * when a priority wasn't finished, was only partly done, or simply repeats.
 * Writes a fresh row in the target week linked back via `carriedFromId`.
 */
export async function carryOverWeeklyGoal(
  input: CarryOverInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = CarryOverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  const src = loaded.row;

  const toWeek = parsed.data.toWeekStart
    ? mondayOf(parsed.data.toWeekStart)
    : nextWeekStart(src.weekStart);

  try {
    const position = await nextPosition(src.employeeId, toWeek);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: src.employeeId,
        weekStart: toWeek,
        position,
        client: src.client,
        subject: src.subject,
        priority: src.priority,
        incentive: src.incentive,
        kpi: src.kpi,
        targetDone: src.targetDone,
        explanation: src.explanation,
        linkUrl: src.linkUrl,
        pctDone: parsed.data.keepProgress ? src.pctDone : 0,
        carriedFromId: src.id,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateWeeklyGoals();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Re-balance a person's active goal weights for a week so they sum to EXACTLY
 * 100 (the fixed weekly budget). Proportional largest-remainder rescale via
 * balanceWeightsToBudget — the one-tap fix for a total that drifted past 100
 * (e.g. 7 goals × 20 = 140 → ~14 each, one nudged to 16 to land on 100).
 * Owner / admin / manager-of-that-person only. Archived goals are left untouched.
 */
export async function balanceWeeklyGoalWeights(
  input: { employeeId: string; weekStart: string },
): Promise<ActionResult<{ updated: number; budget: number }>> {
  const me = await requireUser();
  if (!input?.employeeId || typeof input.employeeId !== "string") {
    return { ok: false, error: "Missing employee" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.weekStart))) {
    return { ok: false, error: "Invalid week" };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Balancing to 100 is a normalization, not arbitrary planning — so OWNERS may
  // balance their OWN week (Sir's rule: a person's weights must total 100), and
  // admins/super-admins/managers may balance anyone in scope.
  const scope = await goalScopeFor(me);
  const allowed =
    me.isAdmin ||
    isSuperAdmin(me.email) ||
    input.employeeId === me.id ||
    scope.ids.includes(input.employeeId);
  if (!allowed) {
    return { ok: false, error: "You can only balance your own or your team's goals" };
  }
  const weekStart = mondayOf(input.weekStart);

  const rows = await db
    .select({ id: weeklyGoals.id, weight: weeklyGoals.weight })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, input.employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
      ),
    );
  if (rows.length === 0) return { ok: true, updated: 0, budget: WEIGHT_BUDGET };

  const balanced = balanceWeightsToBudget(rows);
  try {
    // Few goals per person (≈5–10) → a small sequential update loop is fine and
    // keeps the SQL trivial; only the goals whose weight actually changes write.
    let updated = 0;
    for (const r of rows) {
      const next = balanced.get(r.id);
      if (next == null || next === r.weight) continue;
      await db
        .update(weeklyGoals)
        .set({ weight: next, updatedById: me.id, updatedAt: new Date() })
        .where(eq(weeklyGoals.id, r.id));
      updated++;
    }
    revalidateWeeklyGoals();
    return { ok: true, updated, budget: WEIGHT_BUDGET };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function deleteWeeklyGoal(input: { id: string }): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = DeleteWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  // #5 — deletion is manager-only; owners can't delete their own goal.
  const loaded = await loadManageableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    await db.delete(weeklyGoals).where(eq(weeklyGoals.id, parsed.data.id));
    // Re-balance the remaining goals so the week still totals exactly 100.
    await rebalanceWeekWeights(loaded.row.employeeId, loaded.row.weekStart, me.id);
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ================================================================== */
/* Bulk import from CSV / Excel / Google Sheets                         */
/* ================================================================== */

/** Normalise a header cell for fuzzy matching: lowercase, alphanumerics only. */
function normHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Which weekly-goal field a spreadsheet column maps to (or null to ignore). */
type ImportField =
  | "client"
  | "subject"
  | "priority"
  | "incentive"
  | "kpi"
  | "target"
  | "pctDone"
  | "explanation"
  | "link"
  | "employee"
  // Redesign (additive): Planning columns.
  | "targetDate"
  | "notes";

function mapHeader(raw: string): ImportField | null {
  const h = normHeader(raw);
  if (!h) return null;
  // Order matters: check the more specific tokens first.
  if (h.includes("employee") || h.includes("assignee") || h.includes("doer") || h.includes("teammember") || h === "email")
    return "employee";
  if (h.includes("client")) return "client";
  if (h.includes("subject")) return "subject";
  if (h.includes("priority") || h === "prio") return "priority";
  if (h.includes("incentive")) return "incentive";
  if (h.includes("kpi")) return "kpi";
  // "Target Date"/"Due Date" → the per-goal date; plain "Target" stays the Goal text.
  if (h.includes("targetdate") || h.includes("duedate") || (h.includes("target") && h.includes("date")))
    return "targetDate";
  if (h.includes("target")) return "target";
  if (h.includes("percent") || h.includes("%") || h.includes("pct") || h.includes("done") || h.includes("actual"))
    return "pctDone";
  if (h.includes("explanation") || h.includes("explain") || h.includes("remark") || h.includes("comment"))
    return "explanation";
  // Planning notes (kept distinct from Explanation; "note" stays a fallback for explanation below).
  if (h === "notes" || h.includes("planningnote") || h.includes("plannote")) return "notes";
  if (h.includes("note")) return "explanation";
  if (h.includes("link") || h.includes("url") || h.includes("proof")) return "link";
  return null; // Sr. No. and anything unrecognised is skipped.
}

function parsePriority(raw: unknown): TaskPriority {
  const v = normHeader(raw);
  if (!v) return "imp_not_urgent";
  if (v === "1" || v.includes("critical")) return "imp_urgent";
  if (v === "3" || (v.includes("noti") && v.includes("urgent")) || v === "urgent") return "not_imp_urgent";
  if (v === "4" || v.includes("normal") || v.includes("low")) return "not_imp_not_urgent";
  if (v === "2" || v.includes("important")) return "imp_not_urgent";
  // Eisenhower phrasings: "important & urgent" → critical.
  if (v.includes("imp") && v.includes("urgent") && !v.includes("not")) return "imp_urgent";
  return "imp_not_urgent";
}

function parseYesNo(raw: unknown): boolean {
  const v = normHeader(raw);
  return v === "yes" || v === "y" || v === "true" || v === "1" || v === "✓" || v === "done";
}

function parsePct(raw: unknown): number {
  const n = Math.round(Number(String(raw ?? "").replace(/[^0-9.\-]/g, "")));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function cleanText(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Parse an import Target Date cell → yyyy-mm-dd string, or null. Accepts an
 * Excel serial date (xlsx may hand us a number) or any Date-parseable string.
 */
function parseYmd(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  // Excel serial date (days since 1899-12-30).
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Import many weekly goals at once from an uploaded CSV / Excel file (the same
 * format you'd export from Google Sheets). The first row must be headers whose
 * names match the Weekly Goals columns (Client, Subject, Priority, Incentive,
 * KPI, Target, % Done, Explanation, Link). Each remaining row becomes one goal
 * in the chosen week.
 *
 * Targeting:
 *  - Non-admins: every row is filed against themselves (any Employee column is
 *    ignored).
 *  - Admins: rows go to `employeeId` (the person in view). If the file has an
 *    Employee/Email column, each row can override that to fan out across people.
 */
export async function importWeeklyGoals(
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number; warnings: string[] }>> {
  const me = await requireUser();
  // Defense-in-depth fill gate (design §11): no bulk goal creation while the
  // current week's assigned goals are still un-filled.
  try {
    await requireWeeklyGoalsFilled(me);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fill your weekly goals to continue" };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = formData.get("file");
  const weekStartRaw = String(formData.get("weekStart") ?? "");
  const scopedEmployee = String(formData.get("employeeId") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)) return { ok: false, error: "Invalid week" };
  const weekStart = mondayOf(weekStartRaw);

  // Parse the workbook (xlsx handles .xlsx, .xls and .csv transparently).
  let matrix: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "The file has no sheets" };
    const ws = wb.Sheets[sheetName]!;
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (matrix.length < 2) return { ok: false, error: "File needs a header row and at least one data row" };

  // Build the column → field map from the first row.
  const headerRow = matrix[0] ?? [];
  const colMap: (ImportField | null)[] = headerRow.map((c) => mapHeader(String(c)));
  if (!colMap.some((f) => f && f !== "employee")) {
    return {
      ok: false,
      error: "Couldn't recognise any columns. Make sure the first row has headers like Client, Subject, Priority, Target, % Done.",
    };
  }

  // For admins, resolve an optional per-row Employee/Email column against the
  // roster (by name or email). Non-admins always file against themselves.
  const roster = me.isAdmin
    ? await db
        .select({ id: employees.id, name: employees.name, email: employees.email })
        .from(employees)
        .where(eq(employees.isActive, true))
    : [];
  const byName = new Map(roster.map((e) => [normHeader(e.name), e.id]));
  const byEmail = new Map(roster.map((e) => [String(e.email ?? "").toLowerCase().trim(), e.id]));

  const warnings: string[] = [];
  // Goals grouped by their target employee so positions stay sequential.
  const pending = new Map<string, Array<Omit<typeof weeklyGoals.$inferInsert, "employeeId" | "weekStart" | "position">>>();

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const get = (field: ImportField): unknown => {
      const idx = colMap.indexOf(field);
      return idx === -1 ? "" : row[idx];
    };

    const client = cleanText(get("client"), 160);
    const subject = cleanText(get("subject"), 160);
    const target = cleanText(get("target"), 2000);
    const explanation = cleanText(get("explanation"), 4000);
    // Skip fully-blank rows silently.
    if (!client && !subject && !target && !explanation) continue;

    // Resolve target employee.
    let employeeId = me.isAdmin ? scopedEmployee : me.id;
    if (me.isAdmin) {
      const empCell = String(get("employee") ?? "").trim();
      if (empCell) {
        const resolved = byEmail.get(empCell.toLowerCase()) ?? byName.get(normHeader(empCell));
        if (resolved) employeeId = resolved;
        else warnings.push(`Row ${r + 1}: employee "${empCell}" not found — skipped.`);
      }
    }
    if (!employeeId || employeeId === "all") {
      warnings.push(`Row ${r + 1}: no team member to assign — pick a person first or add an Employee column.`);
      continue;
    }

    let linkUrl = cleanText(get("link"), 2000);
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = `https://${linkUrl}`;

    const list = pending.get(employeeId) ?? [];
    list.push({
      client,
      subject,
      priority: parsePriority(get("priority")),
      incentive: parseYesNo(get("incentive")),
      kpi: parseYesNo(get("kpi")),
      targetDone: target,
      pctDone: parsePct(get("pctDone")),
      explanation,
      linkUrl,
      weight: 100,
      targetDate: parseYmd(get("targetDate")),
      notes: cleanText(get("notes"), 4000),
      createdById: me.id,
      updatedById: me.id,
    });
    pending.set(employeeId, list);
  }

  let imported = 0;
  try {
    for (const [employeeId, goals] of pending) {
      let position = await nextPosition(employeeId, weekStart);
      const values = goals.map((g) => ({ ...g, employeeId, weekStart, position: position++ }));
      if (values.length === 0) continue;
      await db.insert(weeklyGoals).values(values);
      imported += values.length;
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  const skipped = matrix.length - 1 - imported;
  revalidateWeeklyGoals();
  return { ok: true, imported, skipped: Math.max(0, skipped), warnings: warnings.slice(0, 20) };
}

/* ================================================================== */
/* Weekly-goal incentive — admin attaches a ₹ amount when incentive=Yes */
/* ================================================================== */

/**
 * Admin sets the incentive flag + ₹ amount on a weekly goal.
 *
 * PORT ADAPTATION (decoupled from the incentive ledger): the intern app also
 * upserted a pending `incentive_requests` ledger entry here (source='weekly_goal').
 * That coupling — and the `ensureIncentiveColumns()` schema shim — is removed.
 * `incentive` (boolean) + `incentiveAmount` are kept as plain stored columns on
 * the goal; nothing is auto-created in the incentive system.
 */
export async function setWeeklyGoalIncentive(input: {
  id: string;
  incentive: boolean;
  amount: number;
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Invalid id" };
  const amount = Math.max(0, Math.min(10_000_000, Math.round(Number(input.amount) || 0)));

  // #5 — incentive is a planning field → manager-only.
  const loaded = await loadManageableGoal(input.id, me);
  if (!loaded.ok) return loaded;
  const goal = loaded.row;

  try {
    await db
      .update(weeklyGoals)
      .set({
        incentive: input.incentive,
        incentiveAmount: input.incentive ? amount : 0,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, input.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidateWeeklyGoals();
  return { ok: true };
}

/* ================================================================== */
/* Review flow — super-admins only (design §5)                         */
/* ================================================================== */

/**
 * Set the reviewer-side fields on a goal (Status, Accept %, Review Notes).
 * Super-admins only. Stamps `reviewedById`/`reviewedAt` provenance. Only the
 * keys actually supplied are written (a partial review doesn't clobber).
 *
 * Lock rule: once a goal is approved (`approvedAt` set), Accept % is locked —
 * an `acceptPct` write is rejected until the goal is un-approved. Status and
 * Review Notes remain editable.
 */
export async function setWeeklyGoalReview(
  input: ReviewWeeklyGoalInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ReviewWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, status, acceptPct, reviewNotes } = parsed.data;

  // Review is the manager tier: admin / super-admin / the owner's manager. Doers
  // are rejected here even though they can set their own % + status elsewhere.
  const loaded = await loadManageableGoal(id, me);
  if (!loaded.ok) return loaded;
  const goal = loaded.row;

  // ANYTHING SHORT OF 100 HAS TO BE EXPLAINED — the same rule cascade goals
  // enforce in app/(app)/goals/review/actions.ts, applied here so the Review
  // workbench behaves identically whichever level's row you are scoring.
  //
  // The note that MATTERS is the one the row ends up with: `reviewNotes` being
  // absent from the patch means the existing note stands, and an existing note
  // satisfies the rule. Only an ending state of "under 100, nothing written"
  // is refused.
  if (acceptPct != null && acceptPct < 100) {
    const endingNote = (reviewNotes !== undefined ? reviewNotes : goal.reviewNotes) ?? "";
    if (!endingNote.trim()) {
      return { ok: false, error: "Add an approver note explaining why this is under 100%." };
    }
  }

  // Accept % is locked once approved — reject the write rather than silently drop it.
  if (acceptPct !== undefined && goal.approvedAt) {
    return { ok: false, error: "Accept % is locked while approved — un-approve to change it" };
  }

  const patch: Record<string, unknown> = {
    reviewedById: me.id,
    reviewedAt: new Date(),
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (status !== undefined) patch.status = status;
  if (acceptPct !== undefined) patch.acceptPct = acceptPct;
  if (reviewNotes !== undefined) patch.reviewNotes = reviewNotes;

  try {
    await db.update(weeklyGoals).set(patch).where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Approve (or un-approve) a goal. Super-admins only. On approve: stamps
 * `approvedAt` + review provenance, sets `status='approved'`, and locks Accept %.
 * On un-approve: clears `approvedAt` (unlocks Accept %); the status is left as-is
 * for the reviewer to set. Reversible.
 */
export async function approveWeeklyGoal(
  input: ApproveWeeklyGoalInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ApproveWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, approved } = parsed.data;

  // Approve is the manager tier (admin / super-admin / the owner's manager).
  const loaded = await loadManageableGoal(id, me);
  if (!loaded.ok) return loaded;
  const goal = loaded.row;

  // (The 5-goal weekly minimum was removed per founder 2026-06-20 — that gate
  //  only belongs to the Daily Checklist, not Weekly Goals.)

  const now = new Date();
  const patch: Record<string, unknown> = approved
    ? {
        approvedAt: now,
        status: "approved",
        reviewedById: me.id,
        reviewedAt: now,
        updatedById: me.id,
        updatedAt: now,
      }
    : {
        approvedAt: null,
        reviewedById: me.id,
        reviewedAt: now,
        updatedById: me.id,
        updatedAt: now,
      };

  try {
    await db.update(weeklyGoals).set(patch).where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Toggle a goal's `archived` flag. Super-admins only. Archived goals drop off
 * the active board and out of weekly-score aggregates but stay queryable.
 * Reversible.
 */
export async function archiveWeeklyGoal(
  input: ArchiveWeeklyGoalInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ArchiveWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, archived } = parsed.data;

  // Archive is the manager tier (admin / super-admin / the owner's manager).
  const loaded = await loadManageableGoal(id, me);
  if (!loaded.ok) return loaded;

  try {
    await db
      .update(weeklyGoals)
      .set({ archived, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Duplicate a goal into the SAME week (owner or admin) — distinct from
 * carry-over, which targets the NEXT week + sets `carriedFromId`. Copies the
 * planning fields into a fresh row with a new `position`; progress (% Done +
 * provenance) and all review fields are reset; `carriedFromId` is left NULL.
 */
export async function duplicateWeeklyGoal(
  input: DuplicateWeeklyGoalInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DuplicateWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // #5 — duplicate is manager-only; owners can't duplicate their own goal.
  const loaded = await loadManageableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  const src = loaded.row;

  try {
    const position = await nextPosition(src.employeeId, src.weekStart);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: src.employeeId,
        weekStart: src.weekStart,
        position,
        client: src.client,
        subject: src.subject,
        priority: src.priority,
        incentive: src.incentive,
        incentiveAmount: src.incentiveAmount,
        kpi: src.kpi,
        targetDone: src.targetDone,
        explanation: src.explanation,
        linkUrl: src.linkUrl,
        weight: src.weight,
        targetDate: src.targetDate,
        notes: src.notes,
        // Progress + review reset; no carry-over link.
        pctDone: 0,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateWeeklyGoals();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
