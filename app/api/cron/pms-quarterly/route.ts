import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { scoreForMany } from "@/lib/queries/pms";
import type { ScoreBreakdown } from "@/lib/pms/engines/score";
import { sendPmsQuarterlyReportEmail } from "@/lib/dispatch/email";
import { sendPmsReportWhatsApp } from "@/lib/whatsapp/approval";
import { isDispatchV2On, isDispatchV2DryRun } from "@/lib/dispatch/flag";
import { siteUrl } from "@/lib/site-url";
import type { PmsPillarLine } from "@/emails/notifications/PmsQuarterlyReport";

/**
 * WS-7 · Quarterly PMS report dispatch.
 *
 * Registered (see INTEGRATION NOTE) to run at 05:00 UTC on the 10th of Jan /
 * Apr / Jul / Oct — i.e. the 10th of the month after each FY quarter closes:
 *   `0 5 10 1,4,7,10 *`
 *
 * For every active employee it computes their PMS score + pillar breakdown and
 * emails (and, if opted-in, WhatsApps) them a report. The actual SEND is gated
 * behind DISPATCH_V2 — with the flag off (default) this route runs a harmless
 * dry-run: it computes recipients + scores and returns counts, sending nothing.
 *
 * NOTE (scoring window): the PMS engine currently scores the LIVE IST month
 * snapshot, not a historical 3-month aggregate. The report is labelled with the
 * closed quarter but reflects the current snapshot until a quarter-window scorer
 * exists. Flagged in the integration note.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets this).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLAR_META: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: "kpi", label: "KPI" },
  { key: "skillUpgrade", label: "Skill Upgrade" },
  { key: "compliance", label: "Compliance" },
  { key: "attitude", label: "Attitude" },
  { key: "teamwork", label: "Team-Work" },
];

/** Display-only band. NOT the WS-2 incentive grade policy (which is flagged). */
function bandLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Steady";
  if (score >= 35) return "Developing";
  return "Needs Focus";
}

/** Label the just-closed FY quarter for a run in month `m` (1-12), year `y`. */
function quarterLabel(y: number, m: number): string {
  // Report month → closed quarter.
  if (m === 4) return `Q1 FY ${y}-${String((y + 1) % 100).padStart(2, "0")} (Apr–Jun)`;
  if (m === 7) return `Q2 FY ${y}-${String((y + 1) % 100).padStart(2, "0")} (Jul–Sep)`;
  if (m === 10) return `Q3 FY ${y}-${String((y + 1) % 100).padStart(2, "0")} (Oct–Dec)`;
  // January → Q4 of the FY that started the PREVIOUS April.
  if (m === 1) return `Q4 FY ${y - 1}-${String(y % 100).padStart(2, "0")} (Jan–Mar)`;
  return `${y}-${String(m).padStart(2, "0")} quarter`;
}

function pillars(breakdown: ScoreBreakdown): PmsPillarLine[] {
  return PILLAR_META.map(({ key, label }) => {
    const p = breakdown[key];
    return { label, weight: p.weight, pct: p.rate === null ? null : p.rate * 100 };
  });
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const label = quarterLabel(ist.getUTCFullYear(), ist.getUTCMonth() + 1);
  const armed = isDispatchV2On();
  const dryRun = isDispatchV2DryRun();
  const site = siteUrl();

  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      whatsappOptedIn: employees.whatsappOptedIn,
      whatsappPhone: employees.whatsappPhone,
      whatsappTemplateLocale: employees.whatsappTemplateLocale,
    })
    .from(employees)
    .where(eq(employees.isActive, true));

  const scores = await scoreForMany(roster.map((r) => r.id));
  const scoreById = new Map(scores.map((s) => [s.employeeId, s]));

  let emailed = 0;
  let whatsapped = 0;
  let skipped = 0;

  for (const person of roster) {
    const s = scoreById.get(person.id);
    if (!s) {
      skipped++;
      continue;
    }
    const overall = s.score.score;
    const lines = pillars(s.score.breakdown);

    const emailRes = await sendPmsQuarterlyReportEmail({
      recipient: { email: person.email, name: person.name },
      quarterLabel: label,
      overallScore: overall,
      bandLabel: bandLabel(overall),
      pillars: lines,
      siteUrl: site,
    });
    if (emailRes.sent) emailed++;
    else if (emailRes.error) {
      console.error(`[cron/pms-quarterly] email failed for ${person.email}:`, emailRes.error);
    }

    const waRes = await sendPmsReportWhatsApp({
      recipient: person,
      name: person.name,
      quarterLabel: label,
      overallScore: overall,
    });
    if (waRes.sent) whatsapped++;
  }

  return NextResponse.json({
    ok: true,
    quarter: label,
    armed,
    dryRun,
    recipients: roster.length,
    emailed,
    whatsapped,
    skipped,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
