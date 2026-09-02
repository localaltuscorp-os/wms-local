import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import {
  assignedTasksForToday,
  getTodayItems,
  listPullableGoals,
  listGoalsForPlanner,
  getOverdueItems,
} from "@/lib/queries/daily-checklist";
import { localDateString } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/plan — Plan Your Day: today's committed items + the pieces to
 * build from (assigned tasks, pullable weekly goals, planner goals with today's
 * actuals, rolled-over overdue), plus the MIN-items meter that gates clock-in.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";

  const [items, assigned, pullable, goals, overdue] = await Promise.all([
    getTodayItems(me.id),
    assignedTasksForToday(me.id),
    listPullableGoals(me.id),
    listGoalsForPlanner(me.id),
    getOverdueItems(me.id),
  ]);

  const plannedCount = items.length;
  const isLogged = (g: { todayPct: number | null; todayNote: string | null }) => g.todayPct != null || g.todayNote != null;
  const needsGoalActuals = goals.some((g) => !isLogged(g));

  return NextResponse.json(
    {
      date: localDateString(tz),
      minItems: MIN_DAILY_ITEMS,
      plannedCount,
      satisfied: plannedCount >= MIN_DAILY_ITEMS,
      needsGoalActuals,
      items: items.map(planItem),
      assignedTasks: assigned.map(planItem),
      pullableGoals: pullable.map((g) => ({ id: g.id, client: g.client, subject: g.subject, targetDone: g.targetDone, weight: g.weight })),
      goals: goals.map((g) => ({
        id: g.id, client: g.client, subject: g.subject, targetDone: g.targetDone,
        weight: g.weight, pctDone: g.pctDone, loggedToday: isLogged(g), todayNote: g.todayNote,
      })),
      overdue: overdue.map((o) => ({ id: o.id, title: o.title, client: o.client, subject: o.subject, origin: o.origin, goalId: o.goalId })),
    },
    { headers: MOBILE_CORS },
  );
}

function planItem(it: { id: string; source: string; title: string; client: string | null; subject: string | null; origin: string; goalId: string | null; taskId: string | null; done: boolean }) {
  return { id: it.id, source: it.source, title: it.title, client: it.client, subject: it.subject, origin: it.origin, goalId: it.goalId, taskId: it.taskId, done: it.done };
}
