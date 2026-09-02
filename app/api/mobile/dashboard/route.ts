import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, tasks, employees } from "@/lib/db";
import { PENDING_STATUSES } from "@/db/enums";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listMyAttendance } from "@/lib/queries/attendance";
import { countUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { localDateString, formatTimeInTz } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/dashboard — the native "Today" screen's data: a greeting,
 * today's attendance punches, and the signed-in user's task counts (as doer).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  const days = await listMyAttendance(me.id, today);
  const todayRow = days.find((d) => d.date === today);

  // Weekly-goals fill gate (design §11) — surfaced so the Today screen can show
  // the gate banner / block before the user works.
  const unfilledGoals = await countUnfilledWeekGoals(me.id);

  const mine = and(eq(tasks.doerId, me.id), eq(tasks.archived, false));
  const pendingStatuses = [...PENDING_STATUSES];
  const [pending, overdue] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(and(mine, inArray(tasks.status, pendingStatuses))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(mine, inArray(tasks.status, pendingStatuses), sql`${effectiveDueAtSql()} < now()`)),
  ]);

  // Admin gets the org-wide KPI strip (mirrors the web kpi-strip.tsx status
  // buckets). Non-admins get just their own pending/overdue.
  let adminStats: {
    total: number; needInfo: number; notApproved: number; done: number; pending: number; notStarted: number;
  } | null = null;
  let topPerformers: { name: string; done: number }[] | null = null;
  if (me.isAdmin) {
    const org = eq(tasks.archived, false);
    const cnt = (extra: ReturnType<typeof inArray>) => db.select({ n: count() }).from(tasks).where(and(org, extra));
    const [total, needInfo, notApproved, done, pend, notStarted, perf] = await Promise.all([
      db.select({ n: count() }).from(tasks).where(org),
      cnt(inArray(tasks.status, ["need_info", "need_help"])),
      cnt(inArray(tasks.status, ["not_approved"])),
      cnt(inArray(tasks.status, ["done", "approved"])),
      cnt(inArray(tasks.status, ["initiated", "follow_up", "follow_up_1", "follow_up_2", "follow_up_3"])),
      cnt(inArray(tasks.status, ["not_started"])),
      // Top performers — completions in the last 30 days, per doer (lean group-by).
      db
        .select({ name: employees.name, n: count() })
        .from(tasks)
        .innerJoin(employees, eq(tasks.doerId, employees.id))
        .where(and(org, inArray(tasks.status, ["done", "approved"]), sql`${tasks.completedAt} >= now() - interval '30 days'`))
        .groupBy(employees.name)
        .orderBy(desc(count()))
        .limit(6),
    ]);
    adminStats = {
      total: total[0]?.n ?? 0,
      needInfo: needInfo[0]?.n ?? 0,
      notApproved: notApproved[0]?.n ?? 0,
      done: done[0]?.n ?? 0,
      pending: pend[0]?.n ?? 0,
      notStarted: notStarted[0]?.n ?? 0,
    };
    topPerformers = perf.map((p) => ({ name: p.name, done: p.n }));
  }

  return NextResponse.json(
    {
      greetingName: me.name.split(" ")[0],
      isAdmin: me.isAdmin,
      attendance: {
        checkedIn: todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null,
        checkedOut: todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null,
      },
      tasks: {
        pending: pending[0]?.n ?? 0,
        overdue: overdue[0]?.n ?? 0,
      },
      adminStats,
      topPerformers,
      weeklyGoalsGate: {
        required: unfilledGoals > 0,
        unfilledCount: unfilledGoals,
      },
    },
    { headers: MOBILE_CORS },
  );
}
