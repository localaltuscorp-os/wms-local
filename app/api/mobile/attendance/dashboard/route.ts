import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * GET /api/mobile/attendance/dashboard?year=&month= — the admin "Att Report":
 * the org-wide monthly attendance summary (web parity with
 * `/attendance/dashboard`). One row per employee with the payable-day count and
 * the P/A/H-D/W-O/H/PL/LWP/CO/late breakdown, plus an org roll-up. Admin only.
 *
 * Reuses `getMonthDashboard` — one source of truth with the web dashboard.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!me.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const tz = me.timezone || "Asia/Kolkata";
  const todayISO = localDateString(tz);
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || Number(todayISO.slice(0, 4));
  const month = Number(url.searchParams.get("month")) || Number(todayISO.slice(5, 7));

  const rows = await getMonthDashboard(year, month, todayISO);

  const people = rows
    .map((r) => ({
      employeeId: r.employeeId,
      name: r.name,
      payableDays: r.summary.payableDays,
      present: r.summary.present,
      absent: r.summary.absent,
      halfDay: r.summary.halfDay,
      weeklyOff: r.summary.weeklyOff,
      holiday: r.summary.holiday,
      paidLeave: r.summary.paidLeave,
      unpaidLeave: r.summary.unpaidLeave,
      compOff: r.summary.compOff,
      late: r.summary.late,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totals = people.reduce(
    (acc, p) => {
      acc.present += p.present;
      acc.absent += p.absent;
      acc.halfDay += p.halfDay;
      acc.paidLeave += p.paidLeave;
      acc.unpaidLeave += p.unpaidLeave;
      acc.late += p.late;
      return acc;
    },
    { present: 0, absent: 0, halfDay: 0, paidLeave: 0, unpaidLeave: 0, late: 0 },
  );

  return NextResponse.json(
    {
      year,
      month,
      monthLabel: `${MONTHS[month - 1] ?? ""} ${year}`,
      generatedAt: new Date().toISOString(),
      peopleCount: people.length,
      totals,
      people,
    },
    { headers: MOBILE_CORS },
  );
}
