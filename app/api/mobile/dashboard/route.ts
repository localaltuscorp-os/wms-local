import { NextResponse } from "next/server";
import { and, count, eq, inArray, lt } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { PENDING_STATUSES } from "@/db/enums";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listMyAttendance } from "@/lib/queries/attendance";
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

  const mine = and(eq(tasks.doerId, me.id), eq(tasks.archived, false));
  const pendingStatuses = [...PENDING_STATUSES];
  const [pending, overdue] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(and(mine, inArray(tasks.status, pendingStatuses))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(mine, inArray(tasks.status, pendingStatuses), lt(tasks.dueAt, new Date()))),
  ]);

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
    },
    { headers: MOBILE_CORS },
  );
}
