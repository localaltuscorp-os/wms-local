import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals, tasks } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import { getTodayItems, listGoalsForPlanner } from "@/lib/queries/daily-checklist";
import { localDateString } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/plan/item — add a commitment to today. Body is one of:
 *   { goalId }  pull a weekly goal · { taskId }  pull an assigned task ·
 *   { title }   add a standalone item. Returns the fresh clock-in meter.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const ymd = localDateString(tz);

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { title?: string; taskId?: string; goalId?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: MOBILE_CORS });

  const nextPosition = async (): Promise<number> => {
    const [row] = (await db
      .select({ n: sql<number>`COALESCE(MAX(${dailyChecklist.position}), 0) + 1` })
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, me.id), eq(dailyChecklist.planDate, ymd)))) as Array<{ n: number }>;
    return row?.n ?? 1;
  };

  try {
    if (body.goalId) {
      const [goal] = await db
        .select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId, client: weeklyGoals.client, subject: weeklyGoals.subject, targetDone: weeklyGoals.targetDone })
        .from(weeklyGoals)
        .where(eq(weeklyGoals.id, body.goalId))
        .limit(1);
      if (!goal || goal.employeeId !== me.id) return NextResponse.json({ error: "That goal isn't yours." }, { status: 403, headers: MOBILE_CORS });
      await db
        .insert(dailyChecklist)
        .values({ employeeId: me.id, planDate: ymd, goalId: goal.id, origin: "goal_related", title: goal.targetDone?.trim() || goal.subject?.trim() || "Weekly goal", client: goal.client, subject: goal.subject, position: await nextPosition() })
        .onConflictDoNothing({ target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId] });
    } else if (body.taskId) {
      const [task] = await db
        .select({ id: tasks.id, doerId: tasks.doerId, title: tasks.title, client: tasks.client, subject: tasks.subject })
        .from(tasks)
        .where(eq(tasks.id, body.taskId))
        .limit(1);
      if (!task || task.doerId !== me.id) return NextResponse.json({ error: "That task isn't yours." }, { status: 403, headers: MOBILE_CORS });
      await db
        .insert(dailyChecklist)
        .values({ employeeId: me.id, planDate: ymd, taskId: task.id, origin: "standalone", title: task.title, client: task.client, subject: task.subject, position: await nextPosition() });
    } else {
      const title = (body.title ?? "").trim();
      if (title.length < 2) return NextResponse.json({ error: "Type what you'll do (a couple of words)." }, { status: 400, headers: MOBILE_CORS });
      await db
        .insert(dailyChecklist)
        .values({ employeeId: me.id, planDate: ymd, origin: "standalone", title: title.slice(0, 280), position: await nextPosition() });
    }

    const [items, goals] = await Promise.all([getTodayItems(me.id), listGoalsForPlanner(me.id)]);
    return NextResponse.json(
      { ok: true, plannedCount: items.length, satisfied: items.length >= MIN_DAILY_ITEMS, needsGoalActuals: goals.some((g) => g.todayPct == null && g.todayNote == null) },
      { headers: MOBILE_CORS },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: MOBILE_CORS });
  }
}
