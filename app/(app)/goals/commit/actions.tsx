"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor, getDownlineIds } from "@/lib/goals/scope";
import { mondayOf, nextWeekStart, currentWeekStart } from "@/lib/weekly-goals/week";
import { balanceWeightsToBudget } from "@/lib/weekly-goals/effective";
import { syncGoalToTask } from "@/lib/weekly-goals/task-sync";
import { dispatchGoalsReport } from "@/lib/goals/whatsapp-dispatch";
import { weekCommitSatisfied } from "@/lib/goals/predicate-commit";
import { afterResponse } from "@/lib/after";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

type Actor = { id: string; isAdmin: boolean; email: string };

/** Single-row mutations return the fresh `weekly_goals` row (Phase-1 optimistic
 *  spine, design §3.4) so clients reconcile in place instead of refetching.
 *  The ritual stamps (`committedAt` / `approvedByManagerAt`) ride along — the
 *  row IS the weekly table's truth, which the punch gates read. */
type WeeklyRow = typeof weeklyGoals.$inferSelect;

function revalidate() {
  revalidatePath("/goals/commit");
  // bug #17 — commit stamps (weekly rows) render on the level pages' canvas
  // (all three share one loadCanvasData payload) + the cascade shell.
  revalidatePath("/goals/yearly"); // yearly rootView shares the same canvas payload
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/week");
  revalidatePath("/goals/cascade");
}

/**
 * Commit-surface authority for a target PERSON: yourself, anyone you manage
 * (full downline), or org-wide as an admin. Covers both self-commit and the
 * manager "fill/commit on behalf of a downline member" path (design §11b-B).
 */
async function assertCanActFor(
  me: Actor,
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (me.isAdmin || employeeId === me.id) return { ok: true };
  const scope = await goalScopeFor({ id: me.id, isAdmin: me.isAdmin });
  if (scope.all || scope.ids.includes(employeeId)) return { ok: true };
  return { ok: false, error: "You can only commit for yourself or your team." };
}

/** Load a weekly-goal row + gate on the same self/manager/admin scope. */
async function loadRowWritable(
  id: string,
  me: Actor,
): Promise<{ ok: true; row: typeof weeklyGoals.$inferSelect } | { ok: false; error: string }> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  const perm = await assertCanActFor(me, row.employeeId);
  if (!perm.ok) return perm;
  return { ok: true, row };
}

/** Next Sr. No. for an (employee, week). */
async function nextPosition(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int` })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)));
  return (row?.max ?? 0) + 1;
}

/** Re-balance a person's active goals for a week so weights total exactly 100. */
async function rebalanceWeek(employeeId: string, weekStart: string, actorId: string): Promise<void> {
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

/* ------------------------------------------------------------------ */
/* (a) Fill THIS week's progress                                       */
/* ------------------------------------------------------------------ */

const SetProgressSchema = z.object({
  id: z.string().uuid(),
  pctDone: z.number().int().min(0).max(100),
});

/**
 * Set the owner self-rating (% done) on this week's goal. Stamps
 * `pct_updated_at` — that stamp is what the commit gate reads as "progress
 * filled". Owner or a manager acting on behalf; mirrors a linked task's %.
 */
export async function setCommitProgress(
  input: z.infer<typeof SetProgressSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetProgressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid percentage" };
  }
  const loaded = await loadRowWritable(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    const now = new Date();
    const [row] = await db
      .update(weeklyGoals)
      .set({
        pctDone: parsed.data.pctDone,
        pctUpdatedById: me.id,
        pctUpdatedAt: now,
        updatedById: me.id,
        updatedAt: now,
      })
      .where(eq(weeklyGoals.id, parsed.data.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    // Mirror onto a linked task, if any (best-effort — never fail the fill).
    try {
      await syncGoalToTask(parsed.data.id);
    } catch {
      /* task mirror is non-critical */
    }
    revalidate();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/* (b) Commit NEXT week — adopt / add / freeze                         */
/* ------------------------------------------------------------------ */

const AdoptSchema = z.object({ id: z.string().uuid(), adopted: z.boolean() });

/** Cross-out (adopt/drop) a next-week goal from the committed set. */
export async function toggleNextWeekAdopt(
  input: z.infer<typeof AdoptSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdoptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const loaded = await loadRowWritable(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    const [row] = await db
      .update(weeklyGoals)
      .set({ adopted: parsed.data.adopted, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, parsed.data.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidate();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const AddSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().trim().min(1, "Add a short goal").max(2000),
  client: z.string().trim().max(160).nullish(),
  subject: z.string().trim().max(160).nullish(),
});

/**
 * Add an EXTRA next-week goal beyond the prepopulated cascade set (design §6:
 * "add extra"). Files into next week for the target person, then re-balances
 * that week's weights to 100. Self or manager-on-behalf.
 */
export async function addNextWeekGoal(
  input: z.infer<typeof AddSchema>,
): Promise<ActionResult<{ id: string; row: WeeklyRow | null }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const perm = await assertCanActFor(me, parsed.data.employeeId);
  if (!perm.ok) return perm;

  const nextWeek = nextWeekStart(currentWeekStart());
  try {
    const position = await nextPosition(parsed.data.employeeId, nextWeek);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: parsed.data.employeeId,
        weekStart: nextWeek,
        position,
        targetDone: parsed.data.title,
        client: parsed.data.client ?? null,
        subject: parsed.data.subject ?? null,
        adopted: true,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    await rebalanceWeek(parsed.data.employeeId, nextWeek, me.id);
    // Re-read AFTER the weight rebalance so the returned row is server truth.
    const [fresh] = await db
      .select()
      .from(weeklyGoals)
      .where(eq(weeklyGoals.id, row.id))
      .limit(1);
    revalidate();
    return { ok: true, id: row.id, row: fresh ?? null };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const FreezeSchema = z.object({
  employeeId: z.string().uuid(),
  /** THIS week's Monday (the anchor the punch-out gate uses); next week is frozen. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week"),
});

/**
 * FREEZE a person's next-week commitment — stamps `committed_at` on every
 * adopted, non-archived next-week goal that isn't already frozen. Requires ≥1
 * adopted goal. Self or manager-on-behalf.
 *
 * When the ACTOR is a manager and, after this freeze, their whole scope
 * (self + full downline) is committed for both last week (progress filled) and
 * next week (frozen), fire the WhatsApp goals report to Manan — fire-and-forget,
 * post-response, errors swallowed. The dispatcher itself is gated
 * (`goalsWhatsappOn`, default OFF) and dedupes, so this is safe to trigger.
 */
export async function freezeWeekCommit(
  input: z.infer<typeof FreezeSchema>,
): Promise<ActionResult<{ committed: number }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = FreezeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const perm = await assertCanActFor(me, parsed.data.employeeId);
  if (!perm.ok) return perm;

  const anchor = mondayOf(parsed.data.weekStart);
  const nextWeek = nextWeekStart(anchor);

  try {
    // Must have at least one adopted goal to commit.
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, parsed.data.employeeId),
          eq(weeklyGoals.weekStart, nextWeek),
          eq(weeklyGoals.archived, false),
          eq(weeklyGoals.adopted, true),
        ),
      );
    if ((count?.n ?? 0) === 0) {
      return { ok: false, error: "Add at least one goal for next week before you freeze." };
    }

    const now = new Date();
    const frozen = await db
      .update(weeklyGoals)
      .set({ committedAt: now, updatedById: me.id, updatedAt: now })
      .where(
        and(
          eq(weeklyGoals.employeeId, parsed.data.employeeId),
          eq(weeklyGoals.weekStart, nextWeek),
          eq(weeklyGoals.archived, false),
          eq(weeklyGoals.adopted, true),
          sql`${weeklyGoals.committedAt} is null`,
        ),
      )
      .returning({ id: weeklyGoals.id });

    revalidate();

    // Manager delivery trigger — after everyone in scope is done, send the report.
    afterResponse(async () => {
      try {
        const downline = await getDownlineIds(me.id);
        if (downline.length === 0) return; // only managers dispatch
        const ids = [me.id, ...downline];
        const results = await Promise.all(ids.map((id) => weekCommitSatisfied(id, anchor)));
        if (results.every(Boolean)) {
          await dispatchGoalsReport(me.id, anchor);
        }
      } catch {
        /* fire-and-forget — a delivery hiccup never touches the freeze */
      }
    });

    return { ok: true, committed: frozen.length };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * UN-freeze a person's next-week commitment (clears `committed_at`) so a
 * mistaken early freeze can be corrected before Monday. Self or manager-on-behalf.
 */
export async function unfreezeWeekCommit(
  input: z.infer<typeof FreezeSchema>,
): Promise<ActionResult> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = FreezeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const perm = await assertCanActFor(me, parsed.data.employeeId);
  if (!perm.ok) return perm;

  const nextWeek = nextWeekStart(mondayOf(parsed.data.weekStart));
  try {
    await db
      .update(weeklyGoals)
      .set({ committedAt: null, updatedById: me.id, updatedAt: new Date() })
      .where(
        and(
          eq(weeklyGoals.employeeId, parsed.data.employeeId),
          eq(weeklyGoals.weekStart, nextWeek),
          eq(weeklyGoals.archived, false),
        ),
      );
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
