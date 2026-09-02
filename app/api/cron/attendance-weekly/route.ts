import { NextResponse } from "next/server";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { weekReportFor } from "@/lib/reports/attendance-report-data";
import { weekLabel } from "@/lib/reports/weekly-attendance-rollup";
import {
  sendWeeklyAttendanceReportEmail,
  sendWeeklyAttendanceRosterEmail,
  type RosterRow,
} from "@/lib/email/report-emails";

/**
 * Sunday WEEKLY attendance report (Sir's rule 6) — each active employee gets
 * their OWN week's login/logout, late marks, early-leaves, and the ₹ money
 * impact; the HR desk gets ONE combined roster of everyone + grand-total ₹ lost.
 *
 * Registered Sunday (`0 12 * * 0`, ~17:30 IST). LIVE — no feature flag. Auth:
 * Bearer CRON_SECRET. Per-recipient try/catch (roster send also wrapped). Node
 * runtime (postgres-js).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const profiles = (await listSalaryProfiles()).filter((p) => p.email);

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  // Collected once during the per-employee loop (reuses each report, no recompute)
  // → the single HR roster email. Only employees with a working day this week land
  // here, matching the per-employee skip below (no all-zero rows cluttering HR's table).
  const rosterRows: RosterRow[] = [];
  let rosterLabel = "";

  for (const p of profiles) {
    processed++;
    try {
      const report = await weekReportFor(p.employeeId, p.annualCtc > 0 ? p.annualCtc / 12 : 0, now);
      // No working days this week (all off / no punches) → skip the noise.
      if (report.days.length === 0) {
        skipped++;
        continue;
      }
      rosterLabel = weekLabel(report.weekStart, report.weekEnd);
      rosterRows.push({ name: p.name, totals: report.totals });
      const res = await sendWeeklyAttendanceReportEmail({
        recipient: { email: p.email, name: p.name },
        weekLabel: rosterLabel,
        totals: report.totals,
        days: report.days,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-weekly] send failed for ${p.email}:`, res.error);
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[cron/attendance-weekly] threw for ${p.email}`, err);
      skipped++;
    }
  }

  // ONE combined roster email to the HR desk — wrapped so a failure never masks
  // the per-employee sends that already went out.
  let rosterSent = false;
  if (rosterRows.length > 0) {
    try {
      const totalLost = rosterRows.reduce((sum, r) => sum + r.totals.salaryReduced, 0);
      const res = await sendWeeklyAttendanceRosterEmail({
        weekLabel: rosterLabel,
        rows: rosterRows,
        totalLost,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-weekly] HR roster send failed:`, res.error);
      } else {
        rosterSent = true;
      }
    } catch (err) {
      console.error(`[cron/attendance-weekly] HR roster threw`, err);
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped, rosterRows: rosterRows.length, rosterSent });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
