import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import {
  getIncentivePeriodSummaries,
  monthStart,
  nameKey,
} from "@/lib/queries/incentives";
import { sendIncentiveMonthlyDigestEmail } from "@/lib/email/resend";

/**
 * Monthly per-employee incentive digest cron.
 *
 * Registered in `vercel.json` to run at 05:00 UTC on the 1st of every month
 * (`0 5 1 * *`). For each ACTIVE employee with incentive activity in the
 * trailing month, we email a summary: total earned (approved), paid vs
 * unpaid, and the most recent ledger lines.
 *
 * The incentive ledger keys rows by NAME (not always a FK to employees), so
 * we match each active employee to their summary by a normalised name key —
 * exactly how `getIncentivePeriodSummaries` buckets them. The same EXCLUDED
 * operational actors the dashboard drops are excluded inside the aggregator.
 *
 * Authentication: requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
 * sets this automatically). Both GET (Vercel default) and POST (testability)
 * are accepted. Runs on the Node runtime because postgres-js needs Node APIs.
 *
 * Resilience: never throws per recipient — a send failure is logged and the
 * run continues. Employees with no incentive data in the window are skipped.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncentiveDigestResult {
  ok: true;
  period: string;
  processed: number;
  sent: number;
  skipped: number;
}

const MONTH_LABEL_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** First-of-month for the month BEFORE the month containing `now` (UTC). */
function trailingMonthStart(now: Date): { start: string; end: string; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based, current month
  // Previous month — JS Date handles the year wrap for month -1.
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const start = monthStart(prev.getUTCFullYear(), prev.getUTCMonth() + 1);
  const end = monthStart(y, m + 1); // first-of-this-month (exclusive upper bound)
  const label = MONTH_LABEL_FMT.format(prev);
  return { start, end, label };
}

async function runIncentiveDigest(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { start, end, label } = trailingMonthStart(now);

  // Per-name incentive summaries for the trailing month + every active
  // employee. Match the two by normalised name key.
  const [summaries, activeEmployees] = await Promise.all([
    getIncentivePeriodSummaries(start, end),
    db
      .select({ id: employees.id, email: employees.email, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true)),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const recipient of activeEmployees) {
    processed++;
    const summary = summaries.get(nameKey(recipient.name));
    // No incentive activity this period → no email (skip the noise).
    if (!summary || summary.entryCount === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await sendIncentiveMonthlyDigestEmail({
        recipient: { email: recipient.email, name: recipient.name },
        periodLabel: label,
        approvedTotal: summary.approved,
        paidTotal: summary.paid,
        unpaidTotal: summary.unpaid,
        recent: summary.recent.map((r) => ({
          label: r.label,
          periodMonth: r.periodMonth,
          approved: r.approved,
          paid: r.paid,
        })),
        siteUrl,
      });
      if (result.error) {
        console.error(
          `[cron/incentive-digest] send failed for ${recipient.email}:`,
          result.error,
        );
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(
        `[cron/incentive-digest] send threw for ${recipient.email}`,
        err,
      );
      skipped++;
    }
  }

  return NextResponse.json<IncentiveDigestResult>({
    ok: true,
    period: label,
    processed,
    sent,
    skipped,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return runIncentiveDigest(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return runIncentiveDigest(request);
}
