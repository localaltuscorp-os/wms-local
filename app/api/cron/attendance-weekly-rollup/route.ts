import { NextResponse } from "next/server";
import { FOUNDER_EMAIL } from "@/lib/auth/founder";
import { buildWeeklyAttendanceRollup } from "@/lib/reports/weekly-attendance-rollup";
import { sendWeeklyAttendanceTeamEmail } from "@/lib/email/report-emails";

/**
 * SUNDAY-MORNING ROLLUP — one attendance + money-lost email per manager, and one
 * org-wide email to Manan.
 *
 *   • every manager → ONE email listing everyone BELOW them (full downline),
 *     with present / absent / late / early-leave counts and the ₹ lost per head
 *     plus a grand total.
 *   • Manan → ONE email with every active employee, same table.
 *
 * Both go to the recipient's BUSINESS address (`officialEmail`, falling back to
 * the login address) — never a personal mailbox, because these reports carry
 * other people's pay impact. NO attachment: no CSV, no XLSX; the table is the
 * report.
 *
 * Registered Sunday (`30 3 * * 0`, ~09:00 IST) — deliberately a separate cron
 * from `attendance-weekly` (Sunday evening), which mails each employee their own
 * report and HR the roster. LIVE — no feature flag, matching its sibling. Auth:
 * Bearer CRON_SECRET. Per-recipient try/catch. Node runtime (postgres-js).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const rollup = await buildWeeklyAttendanceRollup({ founderEmailLogin: FOUNDER_EMAIL });

  if (rollup.graded === 0) {
    return NextResponse.json({ ok: true, skipped: "no employee had a working day this week" });
  }

  let managersSent = 0;
  let managersFailed = 0;
  for (const m of rollup.managers) {
    try {
      const res = await sendWeeklyAttendanceTeamEmail({
        recipient: { email: m.email, name: m.name },
        scopeLabel: m.scopeLabel,
        subjectScope: m.subjectScope,
        weekLabel: rollup.weekLabel,
        rows: m.rows,
        totalLost: m.totalLost,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-weekly-rollup] manager send failed for ${m.email}:`, res.error);
        managersFailed++;
      } else {
        managersSent++;
      }
    } catch (err) {
      console.error(`[cron/attendance-weekly-rollup] manager threw for ${m.email}`, err);
      managersFailed++;
    }
  }

  // Wrapped separately so a founder-side failure never masks the manager sends
  // that already went out.
  let founderSent = false;
  if (rollup.founder) {
    try {
      const res = await sendWeeklyAttendanceTeamEmail({
        recipient: { email: rollup.founder.email, name: rollup.founder.name },
        scopeLabel: rollup.founder.scopeLabel,
        subjectScope: rollup.founder.subjectScope,
        weekLabel: rollup.weekLabel,
        rows: rollup.founder.rows,
        totalLost: rollup.founder.totalLost,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-weekly-rollup] founder send failed:`, res.error);
      } else {
        founderSent = true;
      }
    } catch (err) {
      console.error(`[cron/attendance-weekly-rollup] founder threw`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    week: rollup.weekLabel,
    graded: rollup.graded,
    managers: rollup.managers.length,
    managersSent,
    managersFailed,
    founderSent,
    founderRows: rollup.founder?.rows.length ?? 0,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
