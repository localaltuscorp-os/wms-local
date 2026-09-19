import { NextResponse } from "next/server";
import { localDateString } from "@/lib/format";
import { FOUNDER_EMAIL } from "@/lib/auth/founder";
import { loadDueCompliances } from "@/lib/queries/compliance-reminders";
import { addDays, datesBetween, monthEnd, mondayOf } from "@/lib/compliance/schedule";
import { downlineOf, teamGroups } from "@/lib/compliance/team";
import { buildFounderEmail, planDailyReminders, type PlannedEmail } from "@/lib/compliance/reminders";
import { sendDccDailyReportEmail } from "@/lib/email/dcc-daily-report-email";

/**
 * WCC / MCC REMINDERS (account holder, 2026-09-18). Two jobs, one route:
 *
 *   ?job=daily    `31 16 * * *`   (16:31 UTC = 10:01 pm IST, every night)
 *     Everyone who has not updated a WCC or MCC compliance due today, and
 *     their Team Lead.
 *   ?job=founder  `32 16 * * 3,6` (10:02 pm IST, Wednesday and Saturday)
 *     Manan Sir: who did not fill in the last 3 days, with the WCC week grid
 *     (Mon–Sun) and the MCC month grid (1–31), team-wise.
 * The rules and the HTML live in lib/compliance/reminders.ts and are tested
 * there.
 *
 * ── PREVIEW UNTIL SWITCHED ON ────────────────────────────────────────────
 * Unless `COMPLIANCE_REMINDERS_LIVE=true`, EVERY planned email is delivered to
 * the report owner instead (DCC_DAILY_REPORT_OWNER_EMAIL, the same person the
 * DCC report previews to), with the real recipient named in the subject and a
 * banner. This is a nightly mail to the whole company; it goes live only after
 * the owner has seen exactly what it sends.
 *
 * ── MANUAL RUNS ──────────────────────────────────────────────────────────
 *   ?dryRun=1          plan only — who would get what — nothing is sent
 *   ?dryRun=1&show=N   return planned email N (0-based) as the page itself,
 *                      to read exactly what would be sent — nothing is sent
 *   ?date=YYYY-MM-DD   run for a different day (defaults to today in IST)
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, which Vercel sets on cron calls.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_OWNER = { name: "Vinal Patil", email: "vinalpatil.altuscorp@gmail.com" };
/** Resend allows a couple of requests a second; stay well inside it. */
const SEND_GAP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get("job");
  if (job !== "daily" && job !== "founder") {
    return NextResponse.json({ error: "Pass ?job=daily or ?job=founder." }, { status: 400 });
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  const dateParam = url.searchParams.get("date");
  const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : localDateString("Asia/Kolkata");

  const live = process.env.COMPLIANCE_REMINDERS_LIVE?.trim().toLowerCase() === "true";
  const ownerEmail = process.env.DCC_DAILY_REPORT_OWNER_EMAIL?.trim() || DEFAULT_OWNER.email;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? null;
  const previewTo = (name: string, to: string | null) => (live ? null : `${name} <${to ?? "no address"}>`);

  let plan: PlannedEmail[];
  if (job === "daily") {
    const { people, due } = await loadDueCompliances({ wccFrom: day, wccTo: day, mccMonths: [day.slice(0, 7)] });
    plan = planDailyReminders({ people, due, day, siteUrl, previewTo });
  } else {
    const weekStart = mondayOf(day);
    const weekDates = datesBetween(weekStart, addDays(weekStart, 6));
    const monthKey = day.slice(0, 7);
    const monthDates = datesBetween(`${monthKey}-01`, monthEnd(monthKey));
    const last3 = [addDays(day, -2), addDays(day, -1), day];
    const months = [...new Set([monthKey, ...last3.map((d) => d.slice(0, 7))])];
    const wccFrom = last3[0]! < weekStart ? last3[0]! : weekStart;

    const { people, due } = await loadDueCompliances({ wccFrom, wccTo: addDays(weekStart, 6), mccMonths: months });
    const founder = people.find((p) => p.email.trim().toLowerCase() === FOUNDER_EMAIL);
    if (!founder) {
      return NextResponse.json({ ok: true, job, day, skipped: `No active employee with ${FOUNDER_EMAIL}.` });
    }
    const team = new Set([founder.id, ...downlineOf(founder.id, people)]);
    const visible = people.filter((p) => team.has(p.id));
    const groups = teamGroups(founder.id, visible);
    plan = [
      buildFounderEmail({
        founder,
        groups: groups.map((g) => (g.key === "self" ? { ...g, label: founder.name } : g)),
        names: new Map(visible.map((p) => [p.id, p.name])),
        due: due.filter((d) => team.has(d.ownerId)),
        today: day,
        weekDates,
        monthDates,
        last3,
        previewFor: previewTo(founder.name, founder.address),
      }),
    ];
  }

  if (dryRun) {
    const show = url.searchParams.get("show");
    if (show !== null) {
      const email = plan[Number(show)];
      if (!email) return NextResponse.json({ error: `No planned email ${show}; there are ${plan.length}.` }, { status: 404 });
      return new NextResponse(email.html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      job,
      day,
      live,
      deliversTo: live ? "real recipients" : ownerEmail,
      emails: plan.map((p) => ({ kind: p.kind, recipient: p.recipientName, to: p.to, subject: p.subject })),
    });
  }

  let sent = 0;
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const email of plan) {
    if (live && !email.to) {
      skipped.push(`${email.kind}:${email.recipientName} (no address)`);
      continue;
    }
    const to = live ? email.to! : ownerEmail;
    const subject = live ? email.subject : `[Preview → ${email.recipientName}] ${email.subject}`;
    const res = await sendDccDailyReportEmail({ to, subject, html: email.html });
    if (res.error) {
      console.error(`[cron/compliance-reminders] ${email.kind} for ${email.recipientName} failed:`, res.error);
      failed.push(`${email.kind}:${email.recipientName}`);
    } else {
      sent++;
    }
    await sleep(SEND_GAP_MS);
  }

  return NextResponse.json({ ok: true, job, day, live, planned: plan.length, sent, skipped, failed });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
