import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals, weeklyGoalActuals } from "@/db/schema";
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
 * POST /api/mobile/plan/goal-actual — log today's progress on one weekly goal
 * (the clock-in goal-actuals gate). Body: { goalId, pctDone, note? }. A number
 * bumps the goal's cumulative %; the entry is upserted per (goal, day).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const ymd = localDateString(tz);

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { goalId?: string; pctDone?: number; note?: string } | null;
  if (!body?.goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400, headers: MOBILE_CORS });

  const [goal] = await db.select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId }).from(weeklyGoals).where(eq(weeklyGoals.id, body.goalId)).limit(1);
  if (!goal || goal.employeeId !== me.id) return NextResponse.json({ error: "That goal isn't yours." }, { status: 403, headers: MOBILE_CORS });

  const pct = body.pctDone == null || Number.isNaN(Number(body.pctDone)) ? null : Math.max(0, Math.min(100, Math.round(Number(body.pctDone))));
  const note = (body.note ?? "").toString().trim().slice(0, 500) || null;
  if (pct == null && !note) return NextResponse.json({ error: "Add today's progress (a % or a note)." }, { status: 400, headers: MOBILE_CORS });

  try {
    await db
      .insert(weeklyGoalActuals)
      .values({ goalId: goal.id, employeeId: me.id, entryDate: ymd, pct, note, createdById: me.id })
      .onConflictDoUpdate({ target: [weeklyGoalActuals.goalId, weeklyGoalActuals.entryDate], set: { pct, note, updatedAt: new Date() } });
    if (pct != null) {
      await db.update(weeklyGoals).set({ pctDone: pct, pctUpdatedById: me.id, pctUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(weeklyGoals.id, goal.id));
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
