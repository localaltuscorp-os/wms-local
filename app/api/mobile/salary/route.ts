import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import type { SalaryBreakup } from "@/db/schema";
import { waiveAddBack, netAfterWaiveOff } from "@/lib/salary/waive-off";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** numeric/text column → a clean JS number (drizzle hands numeric back as string). */
function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** The `date` month column (first of the month) → its `YYYY-MM` head. Handle a
 *  string OR a Date defensively — string/Date drift here would mislabel the
 *  payslip. */
function monthKey(month: SalaryBreakup["month"]): string {
  const iso = typeof month === "string" ? month : new Date(month).toISOString().slice(0, 10);
  return iso.slice(0, 7);
}

/** "June 2026" from a `YYYY-MM` key (UTC so the month never rolls a boundary). */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthDto(r: SalaryBreakup) {
  const ym = monthKey(r.month);
  return {
    month: ym,
    monthLabel: monthLabel(ym),
    designation: r.designation,
    companyName: r.companyName,
    present: num(r.present),
    absent: num(r.absent),
    halfDay: num(r.halfDay),
    weeklyOff: num(r.weeklyOff),
    totalDaysWorked: num(r.totalDaysWorked),
    finalWorkingDays: num(r.finalWorkingDays),
    monthlyCtc: num(r.monthlyCtc),
    payableAfterLeave: num(r.payableAfterLeave),
    pt: num(r.pt),
    payableAfterPt: num(r.payableAfterPt),
    advance: num(r.advance),
    previousPending: num(r.previousPending),
    // Raw stored take-home (base). The EFFECTIVE net-to-pay is `netPayable`,
    // which adds back any super-admin wave-off (condoned days).
    finalPayment: num(r.finalPayment),
    waiveOffDays: num(r.waiveOffDays),
    waiveAddBack: Math.round(waiveAddBack(r)),
    netPayable: Math.round(netAfterWaiveOff(r)),
    remarks: r.remarks,
    mananRemarks: r.mananRemarks,
  };
}

/**
 * GET /api/mobile/salary — the SIGNED-IN user's own payslip history: every
 * imported salary-breakup row for them, newest month first, with net pay
 * (finalPayment) + the full component breakdown + the sheet's own attendance
 * figures. Owner-scoped (never another employee's row) via
 * [mySalaryBreakup], which filters on `employee_id`. Read-only; additive to the
 * admin-only web /salary page (which reuses the same query module).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const rows = await mySalaryBreakup(me.id);

  return NextResponse.json(
    {
      ownerName: me.name,
      currency: "INR",
      months: rows.map(monthDto),
    },
    { headers: MOBILE_CORS },
  );
}
