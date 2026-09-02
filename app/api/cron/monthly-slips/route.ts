import { NextResponse } from "next/server";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { getCombinedEarnings } from "@/lib/salary/combined-earnings";
import { renderCombinedEarningsPdf } from "@/lib/salary/combined-earnings-pdf";
import { sendMonthlySlipsEmail } from "@/lib/email/report-emails";
import { employeeEmailTargets } from "@/lib/email/recipients";

/**
 * 12th-of-month SLIPS email (Sir's rule 8) — each active employee gets their
 * salary + incentive + attendance slip for the just-paid month, as a single
 * combined-earnings PDF attachment (reuses `renderCombinedEarningsPdf`).
 *
 * Registered `0 5 12 * *` (12th, 10:30 IST). LIVE — the old
 * `MONTHLY_SLIPS_EMAIL_ON` kill-switch is gone (Sir: no switches), so the slips
 * actually go out; it had never been flipped on.
 * Each slip carries the PAYING ENTITY's own logo (see entityLogoPath).
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Per-recipient try/catch so one
 * failure never poisons the run. Node runtime (pdfkit + postgres-js).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Previous complete month ("YYYY-MM") in IST — the month that was just paid. */
function paidMonth(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  ist.setUTCDate(1);
  ist.setUTCMonth(ist.getUTCMonth() - 1);
  return ist.toISOString().slice(0, 7);
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // No kill-switch (Sir: "no switch, everything live") — this used to self-gate on
  // MONTHLY_SLIPS_EMAIL_ON, which was never flipped, so the slips have never
  // actually gone out. Auth is still the Bearer CRON_SECRET check above.

  const month = paidMonth(new Date());
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const profiles = (await listSalaryProfiles()).filter((p) => p.email);

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const p of profiles) {
    processed++;
    try {
      const data = await getCombinedEarnings(p.employeeId, month, p.name);
      const pdf = await renderCombinedEarningsPdf(data, { generatedBy: "Altus Corp" });
      const filename = `Altus-EarningsSlip-${(data.employeeName || p.name).replace(/\s+/g, "")}-${month}.pdf`;
      // Work + personal + login, deduped — one employee's slip to one
      // employee's own addresses.
      const to = employeeEmailTargets(p);
      if (to.length === 0) {
        skipped++;
        continue;
      }
      const res = await sendMonthlySlipsEmail({
        recipient: { email: to, name: p.name },
        monthLabel: data.monthLabel,
        totalEarnings: data.totalEarnings,
        pdf,
        filename,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/monthly-slips] send failed for ${p.email}:`, res.error);
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[cron/monthly-slips] threw for ${p.email}`, err);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, month, processed, sent, skipped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
