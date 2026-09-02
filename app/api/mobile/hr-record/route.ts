import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import {
  listHrSheetMonths,
  loadHrSheetMonth,
  loadHrPaidLeave,
} from "@/lib/queries/attendance-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Numeric-string / number → a plain finite number (0 when unparseable). */
function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `null` when the numeric cell is genuinely empty (paid-leave "Leaves"). */
function numOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "YYYY-MM-01" (month bucket) → "June 2026". UTC-noon so the label never drifts. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1, 12)),
  );
}

/** "2026-06-04" → "Wed, 4 Jun 2026". UTC-noon so it never crosses a boundary. */
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12)));
}

/**
 * GET /api/mobile/hr-record[?month=YYYY-MM] — the SIGNED-IN employee's own
 * read-only mirror of the HR "Attendance log" sheet (owner-scoped; the web
 * page at /attendance/hr-record is the admin, any-employee counterpart). One
 * month's identity + KPI summary + verbatim day codes, the month index for the
 * switcher, and the paid-leave entitlement block. Every read is an existing
 * indexed query from lib/queries/attendance-log — additive, never touching the
 * punch flow. Fail-safe: a DB hiccup returns `loadError: true` with an empty
 * body (HTTP 200) so the reference screen degrades to a retry, never a 500.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const url = new URL(req.url);
  const qMonth = url.searchParams.get("month");
  const wantBucket =
    qMonth && /^\d{4}-\d{2}/.test(qMonth) ? `${qMonth.slice(0, 7)}-01` : null;

  const empty = {
    employeeName: me.name,
    fy: null as string | null,
    designation: null as string | null,
    companyName: null as string | null,
    remark: null as string | null,
    month: null as string | null,
    monthLabel: null as string | null,
    months: [] as { value: string; label: string }[],
    summary: null,
    days: [] as { day: number; statusCode: string; date: string | null }[],
    paidLeave: null,
    loadError: false,
  };

  try {
    const months = await listHrSheetMonths(me.id);
    const month = wantBucket && months.includes(wantBucket) ? wantBucket : months[0] ?? null;

    const [record, paidLeave] = await Promise.all([
      month ? loadHrSheetMonth(me.id, month) : Promise.resolve(null),
      loadHrPaidLeave(me.id),
    ]);

    const s = record?.summary ?? null;

    return NextResponse.json(
      {
        employeeName: me.name,
        fy: s?.fy ?? null,
        designation: s?.designation ?? null,
        companyName: s?.companyName ?? null,
        remark: s?.remark ?? null,
        month,
        monthLabel: month ? monthLabel(month) : null,
        months: months.map((mo) => ({ value: mo, label: monthLabel(mo) })),
        summary: s
          ? {
              present: num(s.present),
              absent: num(s.absent),
              halfDay: num(s.halfDay),
              weeklyOff: num(s.weeklyOff),
              holiday: num(s.holiday),
              pohFull: num(s.pohFull),
              pohHalf: num(s.pohHalf),
              daysInMonth: num(s.daysInMonth),
              totalDaysWorked: num(s.totalDaysWorked),
            }
          : null,
        days: (record?.days ?? []).map((d) => ({
          day: d.day,
          statusCode: d.statusCode,
          date: d.date,
        })),
        paidLeave: paidLeave
          ? {
              doj: paidLeave.doj,
              dojLabel: paidLeave.doj ? dateLabel(paidLeave.doj) : null,
              totalLeaves: num(paidLeave.totalLeaves),
              cycles: paidLeave.cycles.map((c) => ({
                id: c.id,
                period: c.period,
                status: c.status,
                leaves: numOrNull(c.leaves),
                remarks: c.remarks,
              })),
            }
          : null,
        loadError: false,
      },
      { headers: MOBILE_CORS },
    );
  } catch (err) {
    console.error("[api/mobile/hr-record] load failed", err);
    return NextResponse.json({ ...empty, loadError: true }, { headers: MOBILE_CORS });
  }
}
