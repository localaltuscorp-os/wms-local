"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { mondayOf } from "@/lib/weekly-goals/week";
import { ADMIN_TASK_STATUSES, type TaskStatus } from "@/db/enums";

/**
 * Monday manager-approval actions (Module 3). Every write here is the MANAGER
 * tier — a manager acting on a DOWNLINE member's weekly goals (never their own
 * row; a person is never a manager of themselves). Admins / super-admins reach
 * anyone. Owners are rejected. Shape: gate → rate-limit → zod → write →
 * revalidate → ActionResult, mirroring `app/(app)/weekly-goals/actions.ts`.
 */

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

const uuid = z.string().uuid("Invalid id");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a yyyy-mm-dd date");
const pct = z.coerce.number().int().min(0).max(100);

function revalidateApprove() {
  revalidatePath("/goals/approve");
  revalidatePath("/goals/weekly");
  revalidatePath("/goals/weekly");
  // bug #17 — approval stamps (weekly rows) render on the level pages' canvas
  // (all three share one loadCanvasData payload) + the cascade shell.
  revalidatePath("/goals/yearly"); // yearly rootView shares the same canvas payload
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/week");
  revalidatePath("/goals/cascade");
}

type WeeklyGoalRow = typeof weeklyGoals.$inferSelect;
type LoadResult = { ok: false; error: string } | { ok: true; row: WeeklyGoalRow };
// Phase-1 optimistic spine (design §3.4): single-row mutations return the fresh
// weekly row so clients reconcile in place; bulk actions keep count-only shapes.

/**
 * Load a weekly goal + require the signed-in user is a MANAGER of its owner —
 * admin / super-admin (org-wide) or the owner is in their downline scope, and
 * NEVER themselves. Mirrors weekly-goals `loadManageableGoal` (kept local so this
 * slice never imports another slice's private helper).
 */
async function loadManageableWeeklyGoal(
  id: string,
  me: { id: string; isAdmin: boolean; email: string },
): Promise<LoadResult> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  const scope = await goalScopeFor(me);
  const isManager =
    me.isAdmin ||
    isSuperAdmin(me.email) ||
    (row.employeeId !== me.id && scope.ids.includes(row.employeeId));
  if (!isManager) return { ok: false, error: "Only a manager or admin can approve that" };
  return { ok: true, row };
}

/** Whether `me` may manage (approve/fill) `employeeId`'s week — manager tier. */
async function canManageEmployee(
  me: { id: string; isAdmin: boolean; email: string },
  employeeId: string,
): Promise<boolean> {
  if (me.isAdmin || isSuperAdmin(me.email)) return true;
  if (employeeId === me.id) return false; // never a manager of oneself
  const scope = await goalScopeFor(me);
  return scope.ids.includes(employeeId);
}

/* ================================================================== */
/* Review last-week progress — Accept %, Review notes, Status.         */
/* ================================================================== */

const SetMemberAcceptSchema = z.object({
  weeklyGoalId: uuid,
  acceptPct: pct.nullable().optional(),
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
  status: z.enum([...ADMIN_TASK_STATUSES] as [TaskStatus, ...TaskStatus[]]).optional(),
});

/**
 * Manager sets the reviewer-side fields on a downline member's weekly goal
 * (Accept %, Review notes, optional Status). Only supplied keys are written so a
 * partial review never clobbers. Stamps review provenance. `acceptPct: null`
 * clears the accepted % → effective % falls back to the doer's `pct_done`.
 */
export async function setMemberAccept(
  input: z.input<typeof SetMemberAcceptSchema>,
): Promise<ActionResult<{ row: WeeklyGoalRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetMemberAcceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { weeklyGoalId, acceptPct, reviewNotes, status } = parsed.data;

  const loaded = await loadManageableWeeklyGoal(weeklyGoalId, me);
  if (!loaded.ok) return loaded;

  const patch: Record<string, unknown> = {
    reviewedById: me.id,
    reviewedAt: new Date(),
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (acceptPct !== undefined) patch.acceptPct = acceptPct;
  if (reviewNotes !== undefined) patch.reviewNotes = reviewNotes;
  if (status !== undefined) patch.status = status as TaskStatus;

  try {
    const [row] = await db
      .update(weeklyGoals)
      .set(patch)
      .where(eq(weeklyGoals.id, weeklyGoalId))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidateApprove();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ================================================================== */
/* Fill on behalf — complete an intern's / report's weekly goal.       */
/* ================================================================== */

const SetMemberProgressSchema = z.object({
  weeklyGoalId: uuid,
  pctDone: pct,
});

/**
 * Manager records progress on a downline member's weekly goal (design §11b(B):
 * managers complete their interns' goals). Sets the owner-side `pct_done` on
 * their behalf and stamps `pct_updated_by` provenance so it's clear the manager
 * filled it.
 */
export async function setMemberProgress(
  input: z.input<typeof SetMemberProgressSchema>,
): Promise<ActionResult<{ row: WeeklyGoalRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetMemberProgressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { weeklyGoalId, pctDone } = parsed.data;

  const loaded = await loadManageableWeeklyGoal(weeklyGoalId, me);
  if (!loaded.ok) return loaded;

  try {
    const [row] = await db
      .update(weeklyGoals)
      .set({
        pctDone,
        pctUpdatedById: me.id,
        pctUpdatedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, weeklyGoalId))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidateApprove();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ================================================================== */
/* Approve / un-approve a member's whole week (last-week OR this-week). */
/* ================================================================== */

const ApproveMemberWeekSchema = z.object({
  employeeId: uuid,
  weekStart: ymd,
  approved: z.boolean(),
});

/**
 * Stamp (or clear) `approved_by_manager_at` on EVERY adopted, non-archived
 * weekly goal a downline member owns for `weekStart`. This is the single control
 * behind the Monday gate — the predicate `managerApproveSatisfied` requires every
 * such row stamped, for both last week (progress) and this week (committed goals).
 * `approved:false` un-approves (reversible — the "require change" escape hatch at
 * the member level). `weekStart` is snapped to its Monday defensively.
 */
export async function approveMemberWeek(
  input: z.input<typeof ApproveMemberWeekSchema>,
): Promise<ActionResult<{ affected: number }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ApproveMemberWeekSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, approved } = parsed.data;
  const weekStart = mondayOf(parsed.data.weekStart);

  if (!(await canManageEmployee(me, employeeId))) {
    return { ok: false, error: "Only a manager or admin can approve that" };
  }

  try {
    const rows = await db
      .update(weeklyGoals)
      .set({
        approvedByManagerAt: approved ? new Date() : null,
        reviewedById: me.id,
        reviewedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(weeklyGoals.employeeId, employeeId),
          eq(weeklyGoals.weekStart, weekStart),
          eq(weeklyGoals.archived, false),
          eq(weeklyGoals.adopted, true),
        ),
      )
      .returning({ id: weeklyGoals.id });
    revalidateApprove();
    return { ok: true, affected: rows.length };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ================================================================== */
/* Require change on ONE committed goal — push it back to the doer.    */
/* ================================================================== */

const RequireGoalChangeSchema = z.object({
  weeklyGoalId: uuid,
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
});

/**
 * Push a single committed goal back to its owner: records the manager's change
 * request in `review_notes` and un-freezes the commit (clears `committed_at`) +
 * removes any prior approval (`approved_by_manager_at`), so the member must
 * re-commit an amended goal before Monday approval can pass. Manager tier.
 */
export async function requireGoalChange(
  input: z.input<typeof RequireGoalChangeSchema>,
): Promise<ActionResult<{ row: WeeklyGoalRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RequireGoalChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { weeklyGoalId, reviewNotes } = parsed.data;

  const loaded = await loadManageableWeeklyGoal(weeklyGoalId, me);
  if (!loaded.ok) return loaded;

  const patch: Record<string, unknown> = {
    committedAt: null,
    approvedByManagerAt: null,
    reviewedById: me.id,
    reviewedAt: new Date(),
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (reviewNotes !== undefined) patch.reviewNotes = reviewNotes;

  try {
    const [row] = await db
      .update(weeklyGoals)
      .set(patch)
      .where(eq(weeklyGoals.id, weeklyGoalId))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidateApprove();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
