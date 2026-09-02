import { NextResponse } from "next/server";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { monthReportFor } from "@/lib/reports/attendance-report-data";
import { sendMonthlyAttendanceStatementEmail } from "@/lib/email/report-emails";
import { freezeMonth } from "@/lib/reports/attendance-freeze";
import { monthlyAttendanceStatementOn, attendanceFreezeOn } from "@/lib/reports/flags";
import { employeeEmailTargets } from "@/lib/email/recipients";
import { renderAttendanceStatementPdf } from "@/lib/exports/attendance-statement-pdf";

/**
 * Monthly attendance cycle (Sir's rule 7) — TWO jobs on one route:
 *   ?job=statement  (1st, `0 4 1 * *`) — email each employee last month's
 *                    attendance statement + the "queries by the 2nd, then frozen"
 *                    notice. Gated on MONTHLY_ATTENDANCE_STATEMENT_ON.
 *   ?job=freeze     (2nd, `0 4 2 * *`) — freeze last month so its attendance can
 *                    no longer be edited. Gated on ATTENDANCE_FREEZE_ON.
 * Both DEFAULT OFF (no-op until flipped). Auth: Bearer CRON_SECRET. Node runtime.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Previous complete month in IST → { month:'YYYY-MM', label:'July 2026' }. */
function prevMonth(now: Date): { month: string; label: string; year: number; m: number } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  ist.setUTCDate(1);
  ist.setUTCMonth(ist.getUTCMonth() - 1);
  const year = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const month = `${year}-${String(m).padStart(2, "0")}`;
  return { month, label: `${MONTH[m - 1]} ${year}`, year, m };
}

/** "2 Aug" — the freeze deadline (2nd of the month the cron runs in). */
function freezeDeadlineLabel(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return `2 ${MONTH[ist.getUTCMonth()]}`;
}

/** Last day (YYYY-MM-DD) of a year/month (month 1-12) — grades the whole month. */
function lastDayOfMonth(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const job = new URL(request.url).searchParams.get("job") ?? "statement";
  const { month, label, year, m } = prevMonth(now);

  // ── Freeze job (2nd) ──
  if (job === "freeze") {
    if (!attendanceFreezeOn()) {
      return NextResponse.json({ ok: true, job, skipped: "ATTENDANCE_FREEZE_ON is off" });
    }
    await freezeMonth(month, null);
    return NextResponse.json({ ok: true, job, frozen: month });
  }

  // ── Statement job (1st) ──
  if (!monthlyAttendanceStatementOn()) {
    return NextResponse.json({ ok: true, job, skipped: "MONTHLY_ATTENDANCE_STATEMENT_ON is off" });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const freezeDateLabel = freezeDeadlineLabel(now);
  const refToday = lastDayOfMonth(year, m);
  const profiles = (await listSalaryProfiles()).filter((p) => p.email);

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const p of profiles) {
    processed++;
    try {
      const report = await monthReportFor(p.employeeId, year, m, p.annualCtc > 0 ? p.annualCtc / 12 : 0, refToday);
      if (report.days.length === 0) {
        skipped++;
        continue;
      }
      // Their OWN addresses only — resolved from this one profile, so a
      // statement can never reach anybody else's inbox.
      const to = employeeEmailTargets(p);
      if (to.length === 0) {
        skipped++;
        continue;
      }
      // One PDF per employee, built from THIS employee's report only. A PDF
      // failure must not cost them the statement, so the mail still goes with
      // the HTML body alone.
      let pdf: Buffer | undefined;
      try {
        pdf = await renderAttendanceStatementPdf({
          employeeName: p.name,
          monthLabel: label,
          totals: report.totals,
          days: report.days,
          freezeDateLabel,
        });
      } catch (err) {
        console.error(`[cron/attendance-monthly] pdf failed for ${p.employeeId}`, err);
      }

      const res = await sendMonthlyAttendanceStatementEmail({
        recipient: { email: to, name: p.name },
        pdf,
        pdfFilename: `Attendance ${label} - ${p.name}.pdf`.replace(/[^\w\s.-]+/g, ""),
        monthLabel: label,
        totals: report.totals,
        days: report.days,
        freezeDateLabel,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-monthly] send failed for ${p.email}:`, res.error);
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[cron/attendance-monthly] threw for ${p.email}`, err);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, job, month, processed, sent, skipped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
