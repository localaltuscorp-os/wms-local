import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { incentiveNotificationDeliveries } from "@/db/schema";
import { businessEmailFor } from "@/lib/email/recipients";
import { sendIncentiveWeeklyReportEmail } from "@/lib/email/resend";
import { loadIncentiveWeeklyReport } from "@/lib/queries/incentive-weekly-report";
import { weeklyReportVersionKey } from "@/lib/incentive/analytics/weekly-report";
import { formatWeekLabel, mondayOf } from "@/lib/weekly-goals/week";

/**
 * Weekly employee Incentive Report Card cron.
 *
 * Registered in `vercel.json` to run at 05:30 UTC on Sundays (`30 5 * * 0`),
 * which is 11:00 IST. For each ACTIVE employee we email a report card built by
 * the shared incentive analytics layer (lib/incentive/analytics): YTD grade,
 * incentive earned over the current month / last month / last 3 / last 6 / YTD,
 * the current month's target vs actual, and the current vs previous rank with
 * its movement. Grades and ranks are NEVER recomputed here — they come from
 * `buildIncentiveAnalytics`, which imports its thresholds from grading.ts.
 *
 * Authentication: requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
 * sets this automatically). Both GET (Vercel default) and POST (testability)
 * are accepted. Runs on the Node runtime because postgres-js needs Node APIs.
 *
 * Resilience: never throws per recipient — a send failure is logged and the run
 * continues.
 *
 * Idempotency: each delivery is claimed in `incentive_notification_deliveries`
 * (event type "incentive_weekly_report", version key = the Sunday's IST date)
 * before it is sent, so a re-run within the same week sends nothing twice.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WeeklyReportResult {
  ok: true;
  week: string;
  processed: number;
  sent: number;
  skipped: number;
}

async function runIncentiveWeeklyReport(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const versionKey = weeklyReportVersionKey(now);
  const weekLabel = formatWeekLabel(mondayOf(now));

  const [report, activeEmployees] = await Promise.all([
    loadIncentiveWeeklyReport(now),
    db
      .select({
        id: employees.id,
        email: employees.email,
        name: employees.name,
        officialEmail: employees.officialEmail,
      })
      .from(employees)
      .where(eq(employees.isActive, true)),
  ]);

  const cardById = new Map(report.cards.map((c) => [c.employeeId, c]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const emp of activeEmployees) {
    processed++;
    // Employees outside the report population (excluded operational actors,
    // non-employee accounts) have no card — skip, they get nothing.
    const card = cardById.get(emp.id);
    if (!card) {
      skipped++;
      continue;
    }

    // The employee's business address (officialEmail, else login email).
    const email = businessEmailFor({ email: emp.email, officialEmail: emp.officialEmail });
    if (!email) {
      skipped++;
      continue;
    }

    try {
      // Claim the delivery first — idempotent within the week.
      const [claim] = await db
        .insert(incentiveNotificationDeliveries)
        .values({
          eventType: "incentive_weekly_report",
          subjectId: emp.id,
          recipientId: emp.id,
          versionKey,
        })
        .onConflictDoNothing()
        .returning({ id: incentiveNotificationDeliveries.id });
      if (!claim) {
        skipped++;
        continue;
      }

      const result = await sendIncentiveWeeklyReportEmail({
        recipient: { email, name: emp.name },
        weekLabel,
        card,
        siteUrl,
      });
      if (result.error) {
        console.error(
          `[cron/incentive-weekly-report] send failed for ${email}:`,
          result.error,
        );
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(
        `[cron/incentive-weekly-report] send threw for ${email}`,
        err,
      );
      skipped++;
    }
  }

  return NextResponse.json<WeeklyReportResult>({
    ok: true,
    week: weekLabel,
    processed,
    sent,
    skipped,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return runIncentiveWeeklyReport(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return runIncentiveWeeklyReport(request);
}
