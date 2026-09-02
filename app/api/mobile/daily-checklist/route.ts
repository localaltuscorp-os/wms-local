import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { dailyChecklist, weeklyGoals } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import { TZ } from "@/lib/weekly-goals/week";
import {
  todayYmd,
  getTodayItems,
  getOverdueItems,
  listPullableGoals,
  type DailyItem,
} from "@/lib/queries/daily-checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Serialize a DailyItem for the wire (Date → ISO). */
function serializeItem(it: DailyItem) {
  return { ...it, dueAt: it.dueAt ? it.dueAt.toISOString() : null };
}

/** Fetch + shape the full Daily Checklist board (used by GET and after every mutation). */
async function loadBoard(employeeId: string) {
  const [items, overdue, pullable] = await Promise.all([
    getTodayItems(employeeId),
    getOverdueItems(employeeId),
    listPullableGoals(employeeId),
  ]);
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  return {
    date,
    weekday,
    minItems: MIN_DAILY_ITEMS,
    items: items.map(serializeItem),
    overdue,
    pullable,
  };
}

/**
 * GET /api/mobile/daily-checklist — today's committed items (assigned + personal),
 * unfinished items carried from earlier days, and pullable weekly goals. Mirrors
 * the web /daily-checklist page (DailyChecklistView, mode="page").
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const board = await loadBoard(auth.employee.id);
  return NextResponse.json(board, { headers: MOBILE_CORS });
}

type Body =
  | { action: "add"; title?: string; goalId?: string; taskId?: string }
  | { action: "close"; itemId: string; done: boolean; note?: string }
  | { action: "remove"; itemId: string }
  | { action: "carryForward" }
  | { action: "taskDone"; taskId: string; done: boolean };

const MAX_ITEMS_PER_DAY = 50;

async function todayCountAndNextPosition(employeeId: string, ymd: string): Promise<{ count: number; nextPosition: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
    })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return { count: row?.count ?? 0, nextPosition: (row?.max ?? 0) + 1 };
}

/**
 * POST /api/mobile/daily-checklist — one action-discriminated endpoint for every
 * Daily Checklist mutation (add/close/remove/carry-forward/assigned-task-done).
 * Reuses the exact web logic (app/(app)/daily-checklist/actions.ts) so the two
 * clients never drift. Every action returns the FRESH full board — simplest,
 * most robust contract for the native client (replace state, no manual patching).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: MOBILE_CORS });
  }
  const ymd = todayYmd();

  try {
    switch (body.action) {
      case "add": {
        if (body.goalId) {
          const [goal] = await db
            .select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId, client: weeklyGoals.client, subject: weeklyGoals.subject, targetDone: weeklyGoals.targetDone })
            .from(weeklyGoals)
            .where(eq(weeklyGoals.id, body.goalId))
            .limit(1);
          if (!goal || goal.employeeId !== me.id) {
            return NextResponse.json({ error: "That goal isn't yours." }, { status: 403, headers: MOBILE_CORS });
          }
          const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
          if (count >= MAX_ITEMS_PER_DAY) {
            return NextResponse.json({ error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` }, { status: 400, headers: MOBILE_CORS });
          }
          await db
            .insert(dailyChecklist)
            .values({ employeeId: me.id, planDate: ymd, goalId: goal.id, origin: "goal_related", title: goal.targetDone?.trim() || goal.subject?.trim() || "Weekly goal", client: goal.client, subject: goal.subject, position: nextPosition })
            .onConflictDoNothing({ target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId] });
        } else if (body.taskId) {
          const [task] = await db
            .select({ id: tasks.id, doerId: tasks.doerId, title: tasks.title, client: tasks.client, subject: tasks.subject })
            .from(tasks)
            .where(eq(tasks.id, body.taskId))
            .limit(1);
          if (!task || task.doerId !== me.id) {
            return NextResponse.json({ error: "That task isn't yours." }, { status: 403, headers: MOBILE_CORS });
          }
          const [dupe] = await db
            .select({ id: dailyChecklist.id })
            .from(dailyChecklist)
            .where(and(eq(dailyChecklist.employeeId, me.id), eq(dailyChecklist.planDate, ymd), eq(dailyChecklist.taskId, task.id)))
            .limit(1);
          if (!dupe) {
            const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
            if (count >= MAX_ITEMS_PER_DAY) {
              return NextResponse.json({ error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` }, { status: 400, headers: MOBILE_CORS });
            }
            await db
              .insert(dailyChecklist)
              .values({ employeeId: me.id, planDate: ymd, taskId: task.id, origin: "standalone", title: task.title, client: task.client, subject: task.subject, position: nextPosition });
          }
        } else {
          const title = (body.title ?? "").trim();
          if (title.length < 2) return NextResponse.json({ error: "Type what you'll do (a couple of words)." }, { status: 400, headers: MOBILE_CORS });
          if (title.length > 280) return NextResponse.json({ error: "Keep it under 280 characters." }, { status: 400, headers: MOBILE_CORS });
          const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
          if (count >= MAX_ITEMS_PER_DAY) {
            return NextResponse.json({ error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` }, { status: 400, headers: MOBILE_CORS });
          }
          await db.insert(dailyChecklist).values({ employeeId: me.id, planDate: ymd, origin: "standalone", title: title.slice(0, 280), position: nextPosition });
        }
        break;
      }

      case "close": {
        const itemId = body.itemId;
        if (typeof itemId !== "string") return NextResponse.json({ error: "Invalid item." }, { status: 400, headers: MOBILE_CORS });
        const updated = await db
          .update(dailyChecklist)
          .set({
            done: body.done,
            status: body.done ? "done" : "not_started",
            doneNote: body.note?.trim() ? body.note.trim().slice(0, 500) : null,
            closedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
          .returning({ id: dailyChecklist.id });
        if (updated.length === 0) {
          return NextResponse.json({ error: "That item isn't on your checklist." }, { status: 404, headers: MOBILE_CORS });
        }
        break;
      }

      case "remove": {
        const itemId = body.itemId;
        if (typeof itemId !== "string") return NextResponse.json({ error: "Invalid item." }, { status: 400, headers: MOBILE_CORS });
        const removed = await db
          .delete(dailyChecklist)
          .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
          .returning({ id: dailyChecklist.id });
        if (removed.length === 0) {
          return NextResponse.json({ error: "That item isn't on your checklist." }, { status: 404, headers: MOBILE_CORS });
        }
        break;
      }

      case "carryForward": {
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
        const { nextPosition: base } = await todayCountAndNextPosition(me.id, ymd);
        await db.execute(sql`
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
        `);
        break;
      }

      case "taskDone": {
        const taskId = body.taskId;
        if (typeof taskId !== "string") return NextResponse.json({ error: "Invalid task id." }, { status: 400, headers: MOBILE_CORS });
        const [t] = await db
          .select({ doerId: tasks.doerId, updatedAt: tasks.updatedAt, status: tasks.status })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .limit(1);
        if (!t) return NextResponse.json({ error: "Task not found." }, { status: 404, headers: MOBILE_CORS });
        if (t.doerId !== me.id && !me.isAdmin) {
          return NextResponse.json({ error: "Only the assignee can update this task." }, { status: 403, headers: MOBILE_CORS });
        }
        const target: (typeof t)["status"] = body.done ? "done" : "not_started";
        const res = await applyTaskStatusChange(
          { id: me.id, name: me.name, isAdmin: me.isAdmin },
          taskId,
          target,
          t.updatedAt.toISOString(),
        );
        if (!res.ok) {
          return NextResponse.json({ error: res.message ?? "Could not update the task." }, { status: 400, headers: MOBILE_CORS });
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: MOBILE_CORS });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: MOBILE_CORS });
  }

  const board = await loadBoard(me.id);
  return NextResponse.json({ ok: true, ...board }, { headers: MOBILE_CORS });
}
