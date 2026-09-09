import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { buildManagerRollup, renderManagerRollupPdf } from "@/lib/goals/weekly-rollup";
import { sendGoalsRollupEmail } from "@/lib/email/report-emails";
import { uploadMedia, sendDocument } from "@/lib/whatsapp/media";
import { goalsSundayReportOn, goalsWhatsappOn } from "@/lib/goals/flag";

/**
 * Sunday 9 am (Sir #27) — for EACH manager, a rollup PDF (manager + direct reports:
 * last week % vs next week's committed goals + who wrote nothing) is sent to Manan
 * on WhatsApp AND email. Registered `30 3 * * 0` (Sun ~09:00 IST).
 *
 * DEFAULT OFF via `GOALS_SUNDAY_REPORT_ON` (WhatsApp leg also honours
 * `GOALS_WHATSAPP_ON`). Auth: Bearer CRON_SECRET. Node runtime (pdfkit).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!goalsSundayReportOn()) {
    return NextResponse.json({ ok: true, skipped: "GOALS_SUNDAY_REPORT_ON is off" });
  }

  const anchor = currentWeekStart();

  // Recipient = Manan (phone override via WA_GOALS_RECIPIENT, else his row).
  const [manan] = await db
    .select({ email: employees.email, phone: employees.whatsappPhone })
    .from(employees)
    .where(eq(employees.email, "manan@unleashed.in"))
    .limit(1);
  const toPhone = (process.env.WA_GOALS_RECIPIENT?.trim() || manan?.phone?.trim() || "") || null;
  const toEmail = manan?.email ?? null;

  // Every active person who manages someone.
  const managerRows = await db
    .selectDistinct({ managerId: employees.managerId })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.managerId)));
  const managerIds = managerRows.map((m) => m.managerId).filter((x): x is string => !!x);

  let processed = 0;
  let emailed = 0;
  let whatsapped = 0;

  for (const managerId of managerIds) {
    processed++;
    try {
      const rollup = await buildManagerRollup(managerId, anchor);
      if (rollup.rows.length === 0) continue;
      const pdf = await renderManagerRollupPdf(rollup);
      const filename = `WeeklyGoals-${rollup.manager.name.replace(/\s+/g, "")}-${anchor}.pdf`;

      if (toEmail) {
        const r = await sendGoalsRollupEmail({
          recipient: { email: toEmail, name: "Manan Vasa" },
          managerName: rollup.manager.name,
          weekLabel: rollup.weekLabel,
          notWritten: rollup.notWritten,
          total: rollup.rows.length,
          teamAvg: rollup.teamLastAvg,
          pdf,
          filename,
        });
        if (!r.error) emailed++;
      }

      if (goalsWhatsappOn() && toPhone) {
        const up = await uploadMedia(pdf, "application/pdf");
        if (up.ok) {
          const caption = `${rollup.manager.name}'s team — week of ${rollup.weekLabel}. ${rollup.notWritten} of ${rollup.rows.length} wrote no goals · team avg ${rollup.teamLastAvg}%.`;
          const sent = await sendDocument({ toPhone, mediaId: up.id, filename, caption });
          if (sent.ok) whatsapped++;
        }
      }
    } catch (err) {
      console.error(`[cron/goals-sunday-report] failed for manager ${managerId}`, err);
    }
  }

  return NextResponse.json({ ok: true, week: anchor, processed, emailed, whatsapped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
