"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals, weeklyGoalActuals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { todayYmd, listOpenTasksForChecklist, type DailyItem } from "@/lib/queries/daily-checklist";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";
import type { DailyChecklistItem } from "@/db/schema";

/** Hard cap on checklist items per day (keeps one runaway day bounded). */
const MAX_ITEMS_PER_DAY = 50;

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/daily-checklist";
const UUID = z.string().uuid();

/**
 * Explicit RETURNING list — NEVER use bare `.returning()` on daily_checklist:
 * that enumerates every schema column, including migration 0141's
 * `cascade_goal_id`, which may be UNAPPLIED in prod until GOALS_CANVAS_ON
 * ships (see db/schema.ts). Exactly the fields `toItem` consumes.
 */
const DAILY_ITEM_RETURNING = {
  id: dailyChecklist.id,
  title: dailyChecklist.title,
  client: dailyChecklist.client,
  subject: dailyChecklist.subject,
  origin: dailyChecklist.origin,
  goalId: dailyChecklist.goalId,
  taskId: dailyChecklist.taskId,
  status: dailyChecklist.status,
  done: dailyChecklist.done,
  doneNote: dailyChecklist.doneNote,
  movedFromDate: dailyChecklist.movedFromDate,
  position: dailyChecklist.position,
};

type DailyItemRow = Pick<
  DailyChecklistItem,
  | "id"
  | "title"
  | "client"
  | "subject"
  | "origin"
  | "goalId"
  | "taskId"
  | "status"
  | "done"
  | "doneNote"
  | "movedFromDate"
  | "position"
>;

/** Map a DB row → the client-facing DailyItem shape (personal rows only). */
function toItem(r: DailyItemRow): DailyItem {
  return {
    id: r.id,
    source: "personal",
    title: r.title,
    client: r.client,
    subject: r.subject,
    origin: r.origin === "goal_related" ? "goal_related" : "standalone",
    goalId: r.goalId,
    taskId: r.taskId,
    taskNo: null,
    dueAt: null,
    status: r.status,
    done: r.done,
    doneNote: r.doneNote,
    movedFromDate: r.movedFromDate,
    position: r.position,
  };
}

/**
 * Check off (or reopen) a manager-ASSIGNED task straight from the Daily Checklist.
 * One record, one owner: this writes to the TASK itself via the shared status-
 * change core (same permission matrix + audit + notifications as the task list),
 * so completion instantly flows to the manager's dashboard. No checklist copy.
 */
export async function setAssignedTaskDone(
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [t] = await db
    .select({ doerId: tasks.doerId, updatedAt: tasks.updatedAt, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return { ok: false, error: "Task not found." };
  if (t.doerId !== me.id && !me.isAdmin) {
    return { ok: false, error: "Only the assignee can update this task." };
  }
  const target: (typeof t)["status"] = done ? "done" : "not_started";
  const res = await applyTaskStatusChange(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
    target,
    t.updatedAt.toISOString(),
  );
  if (!res.ok) {
    return { ok: false, error: res.message ?? "Could not update the task." };
  }
  revalidatePath(PATH);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Today's row count + the next append position, in one round-trip. Used both to
 * enforce the per-day cap and to give a new row a non-colliding position.
 */
async function todayCountAndNextPosition(
  employeeId: string,
  ymd: string,
): Promise<{ count: number; nextPosition: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
    })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return { count: row?.count ?? 0, nextPosition: (row?.max ?? 0) + 1 };
}

/** Pull a current-week Weekly Goal onto today's checklist (goal-related item). */
export async function pullGoalToToday(
  goalId: string,
): Promise<ActionResult<{ item: DailyItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(goalId).success) return { ok: false, error: "Invalid goal." };

  const [goal] = await db
    .select({
      id: weeklyGoals.id,
      employeeId: weeklyGoals.employeeId,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
    })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, goalId))
    .limit(1);
  if (!goal || goal.employeeId !== me.id) {
    return { ok: false, error: "That goal isn't yours." };
  }

  const ymd = todayYmd();
  try {
    const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY) {
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    }
    const rows = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        goalId: goal.id,
        origin: "goal_related",
        title: goal.targetDone?.trim() || goal.subject?.trim() || "Weekly goal",
        client: goal.client,
        subject: goal.subject,
        position: nextPosition,
      })
      // Same goal can't be pulled twice into one day (unique index).
      .onConflictDoNothing({
        target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId],
      })
      .returning(DAILY_ITEM_RETURNING);
    // NOTE: no revalidatePath here. The daily-plan GATE is rendered by the (app)
    // layout based on needsDailyPlan(); revalidating would re-run the layout and
    // drop the gate the instant the 5th item lands — kicking the user in before
    // they click "Start my day". Page mode refreshes via router.refresh() itself.
    return { ok: true, item: rows[0] ? toItem(rows[0]) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Pull one of the employee's open Tasks onto today's checklist. */
export async function pullTaskToToday(
  taskId: string,
): Promise<ActionResult<{ item: DailyItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task." };

  const [task] = await db
    .select({ id: tasks.id, doerId: tasks.doerId, title: tasks.title, client: tasks.client, subject: tasks.subject })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task || task.doerId !== me.id) return { ok: false, error: "That task isn't yours." };

  const ymd = todayYmd();
  try {
    // Don't pull the same task twice into one day.
    const [dupe] = await db
      .select({ id: dailyChecklist.id })
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, me.id), eq(dailyChecklist.planDate, ymd), eq(dailyChecklist.taskId, taskId)))
      .limit(1);
    if (dupe) return { ok: true, item: null };

    const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY) return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        taskId: task.id,
        origin: "standalone",
        title: task.title,
        client: task.client,
        subject: task.subject,
        position: nextPosition,
      })
      .returning(DAILY_ITEM_RETURNING);
    return { ok: true, item: row ? toItem(row) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Log today's progress on a weekly goal (the daily actuals). Upserts the
 *  per-day row and bumps the goal's cumulative %. */
export async function upsertGoalActual(input: {
  goalId: string;
  pct?: number | null;
  note?: string | null;
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(input?.goalId ?? "").success) return { ok: false, error: "Invalid goal." };

  const [goal] = await db
    .select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, input.goalId))
    .limit(1);
  if (!goal || goal.employeeId !== me.id) return { ok: false, error: "That goal isn't yours." };

  const pct =
    input.pct == null || Number.isNaN(Number(input.pct))
      ? null
      : Math.max(0, Math.min(100, Math.round(Number(input.pct))));
  const note = (input.note ?? "").toString().trim().slice(0, 500) || null;
  if (pct == null && !note) return { ok: false, error: "Add today's progress (a % or a note)." };

  const ymd = todayYmd();
  try {
    await db
      .insert(weeklyGoalActuals)
      .values({ goalId: goal.id, employeeId: me.id, entryDate: ymd, pct, note, createdById: me.id })
      .onConflictDoUpdate({
        target: [weeklyGoalActuals.goalId, weeklyGoalActuals.entryDate],
        set: { pct, note, updatedAt: new Date() },
      });
    // Bump the goal's cumulative % when a number was given (note-only logs the
    // qualitative update without moving the bar).
    if (pct != null) {
      await db
        .update(weeklyGoals)
        .set({ pctDone: pct, pctUpdatedById: me.id, pctUpdatedAt: new Date(), updatedAt: new Date() })
        .where(eq(weeklyGoals.id, goal.id));
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * One-tap "log all at current %" — records today's progress on EVERY open
 * current-week goal that hasn't been logged yet, each at its OWN current % (so
 * the bar doesn't move; it just records "still at X% today"). This clears the
 * clock-in goal gate in a single action for people with many goals, without
 * pretending progress was made. Idempotent (skips goals already logged today).
 */
export async function logAllGoalActuals(): Promise<
  ActionResult<{ logged: { goalId: string; pct: number }[] }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();
  const week = currentWeekStart();
  try {
    const open = await db
      .select({ id: weeklyGoals.id, pctDone: weeklyGoals.pctDone })
      .from(weeklyGoals)
      .leftJoin(
        weeklyGoalActuals,
        and(eq(weeklyGoalActuals.goalId, weeklyGoals.id), eq(weeklyGoalActuals.entryDate, ymd)),
      )
      .where(
        and(
          eq(weeklyGoals.employeeId, me.id),
          eq(weeklyGoals.weekStart, week),
          eq(weeklyGoals.archived, false),
          sql`${weeklyGoals.pctDone} < 100`,
          sql`${weeklyGoalActuals.id} is null`,
        ),
      );
    if (open.length === 0) return { ok: true, logged: [] };
    await db
      .insert(weeklyGoalActuals)
      .values(
        open.map((g) => ({
          goalId: g.id,
          employeeId: me.id,
          entryDate: ymd,
          pct: g.pctDone,
          note: null,
          createdById: me.id,
        })),
      )
      .onConflictDoNothing({ target: [weeklyGoalActuals.goalId, weeklyGoalActuals.entryDate] });
    return { ok: true, logged: open.map((g) => ({ goalId: g.id, pct: g.pctDone })) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Auto-fill today's plan to MIN_DAILY_ITEMS from the employee's open tasks
 *  (newest first) — the quick path that keeps the old "last 5" behaviour. */
export async function autoFillFive(): Promise<ActionResult<{ added: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();
  try {
    const { count } = await todayCountAndNextPosition(me.id, ymd);
    const need = Math.max(0, MIN_DAILY_ITEMS - count);
    if (need === 0) return { ok: true, added: 0 };
    const open = await listOpenTasksForChecklist(me.id);
    let added = 0;
    for (const t of open.slice(0, need)) {
      const res = await pullTaskToToday(t.id);
      if (res.ok && res.item) added++;
    }
    return { ok: true, added };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add a typed ad-hoc (stand-alone) item to today. */
export async function addStandaloneItem(
  formData: FormData,
): Promise<ActionResult<{ item: DailyItem }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (formData.get("title") ?? "").toString().trim();
  if (title.length < 2) return { ok: false, error: "Type what you'll do (a couple of words)." };
  if (title.length > 280) return { ok: false, error: "Keep it under 280 characters." };

  const ymd = todayYmd();
  try {
    const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY) {
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    }
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        origin: "standalone",
        title,
        position: nextPosition,
      })
      .returning(DAILY_ITEM_RETURNING);
    // No revalidatePath — see addStandaloneItem note: keeps the gate from
    // dropping mid-plan. Page mode refreshes via router.refresh().
    return { ok: true, item: toItem(row!) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Close an item out (night) — done/not-done + optional note. */
export async function closeItem(
  itemId: string,
  done: boolean,
  note?: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  try {
    const updated = await db
      .update(dailyChecklist)
      .set({
        done,
        status: done ? "done" : "not_started",
        doneNote: note?.trim() ? note.trim().slice(0, 500) : null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id });
    if (updated.length === 0) return { ok: false, error: "That item isn't on your checklist." };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Remove an item from the checklist (own items only). */
export async function removeItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  try {
    const removed = await db
      .delete(dailyChecklist)
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id });
    if (removed.length === 0) return { ok: false, error: "That item isn't on your checklist." };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Carry forward all unfinished checklist items from earlier days onto today.
 * Re-dates each open item forward (preserving its first-seen date in
 * `moved_from_date`) so it travels until done. Carried items get fresh,
 * SEQUENTIAL positions appended after today's current max so they never collide
 * with today's own positions. Done items keep their original day for the nightly
 * history. Returns how many were carried. (Carry-forward = simply forwarding
 * unfinished checklist items — it has no attendance meaning.)
 */
export async function moveOverdueToToday(): Promise<
  ActionResult<{ moved: number; items: DailyItem[] }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ymd = todayYmd();
  try {
    // Drop any overdue row whose goal is already on today's list (would violate
    // the per-day unique goal index), then re-date the rest forward.
    await db.execute(sql`
      delete from ${dailyChecklist} od
      where od.employee_id = ${me.id}
        and od.plan_date < ${ymd}
        and od.done = false
        and od.goal_id is not null
        and exists (
          select 1 from ${dailyChecklist} t
          where t.employee_id = ${me.id} and t.plan_date = ${ymd} and t.goal_id = od.goal_id
        )
    `);

    // Append after today's current max position so carried items get a clean
    // sequential run (1..n after the base) instead of inheriting their old
    // — and possibly colliding — positions.
    const { nextPosition: base } = await todayCountAndNextPosition(me.id, ymd);
    const moved = (await db.execute(sql`
      with carried as (
        select id,
               (${base} - 1) + row_number() over (
                 order by plan_date asc, position asc, committed_at asc
               ) as new_position
        from ${dailyChecklist}
        where employee_id = ${me.id}
          and plan_date < ${ymd}
          and done = false
      )
      update ${dailyChecklist} dc
      set plan_date = ${ymd},
          position = carried.new_position,
          moved_from_date = coalesce(dc.moved_from_date, dc.plan_date),
          updated_at = now()
      from carried
      where dc.id = carried.id
      returning dc.id, dc.title, dc.client, dc.subject, dc.origin, dc.goal_id,
                dc.task_id, dc.status, dc.done, dc.done_note, dc.moved_from_date, dc.position
    `)) as unknown as Array<{
      id: string; title: string; client: string | null; subject: string | null;
      origin: string; goal_id: string | null; task_id: string | null; status: string; done: boolean;
      done_note: string | null; moved_from_date: string | null; position: number;
    }>;
    const items: DailyItem[] = moved.map((r) => ({
      id: r.id,
      source: "personal",
      title: r.title,
      client: r.client,
      subject: r.subject,
      origin: r.origin === "goal_related" ? "goal_related" : "standalone",
      goalId: r.goal_id,
      taskId: r.task_id,
      taskNo: null,
      dueAt: null,
      status: r.status as DailyItem["status"],
      done: r.done,
      doneNote: r.done_note,
      movedFromDate: r.moved_from_date,
      position: r.position,
    }));
    // No revalidatePath — keeps the gate stable mid-plan (see addStandaloneItem).
    return { ok: true, moved: items.length, items };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
