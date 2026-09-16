import { NextResponse } from "next/server";
import { localDateString } from "@/lib/format";
import { loadDccDailyReportInput } from "@/lib/queries/dcc-daily-report";
import { loadSp1Logs } from "@/lib/queries/dcc-sp1";
import {
  buildDccReportHtml,
  buildPersonReports,
  planDccDailyEmails,
  reportDateLabel,
} from "@/lib/dcc/daily-report";
import { sp1EmailSection } from "@/lib/dcc/sp1-email";
import { sendDccDailyReportEmail } from "@/lib/email/dcc-daily-report-email";

/**
 * THE 10 PM DCC REPORT (DCC-SPEC §10). Registered at `30 16 * * *`
 * (16:30 UTC = 22:00 IST).
 *
 * ── WHO GETS WHAT ────────────────────────────────────────────────────────
 *   · every person with compliances → their own day
 *   · every Team Lead (anybody with people reporting to them, Manan included)
 *     → everyone below them, transitively
 *   · the report owner → all employees
 * One email per RECIPIENT, not one per person reported: a manager of nine gets
 * a single email with nine people in it. The rules live in
 * lib/dcc/daily-report.ts and are unit-tested there.
 *
 * ── THE FORMAT IS JEEVAN'S SP1 SHEET ─────────────────────────────────────
 * The email LEADS with the call-outcome tables — fifteen rows in the sheet's own
 * colours, then the calculated block — and the compliance summary follows. That
 * order is the brief's: the numbers people discuss on the evening call come
 * first, and the tick-list is the supporting detail.
 *
 * ── PREVIEW UNTIL SWITCHED ON ────────────────────────────────────────────
 * Unless `DCC_DAILY_REPORT_LIVE=true`, EVERY planned email is delivered to the
 * report owner instead, with the real recipient named in the subject and a
 * banner. This is a nightly mail to the whole company; it goes live only after
 * the owner has seen exactly what it sends.
 *
 * ── MANUAL RUNS ──────────────────────────────────────────────────────────
 *   ?dryRun=1          plan only — who would get what — nothing is sent
 *   ?date=YYYY-MM-DD   report a different day (defaults to today in IST)
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, which Vercel sets on cron calls.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The report owner — "the report of all employees must come to me". */
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
  const dryRun = url.searchParams.get("dryRun") === "1";
  const dateParam = url.searchParams.get("date");
  const day =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : localDateString("Asia/Kolkata");

  const live = process.env.DCC_DAILY_REPORT_LIVE?.trim().toLowerCase() === "true";
  const owner = {
    name: DEFAULT_OWNER.name,
    email: process.env.DCC_DAILY_REPORT_OWNER_EMAIL?.trim() || DEFAULT_OWNER.email,
  };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? null;

  const input = await loadDccDailyReportInput(day);
  const reports = buildPersonReports(input.employees, input.items, input.entries, day);
  const plan = planDccDailyEmails({ employees: input.employees, reports, day, owner });

  /* The day's call log for EVERYONE in one read, then sliced per email. Reading
     it per recipient would re-query the same day up to once per employee. It
     degrades to empty before migration 0235, which costs the email its SP1
     block and nothing else — the compliance half still sends. */
  const { rows: sp1Rows, missing: sp1Missing } = await loadSp1Logs({
    employeeIds: input.employees.map((e) => e.id),
    from: day,
    to: day,
  }).catch(() => ({ rows: [], missing: true }));

  const dayLabel = reportDateLabel(day);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      day,
      live,
      sp1: sp1Missing ? "unavailable (migration 0235 not applied)" : `${sp1Rows.length} rows`,
      deliversTo: live ? "real recipients" : owner.email,
      emails: plan.map((p) => ({
        kind: p.kind,
        recipient: p.recipientName,
        to: p.to,
        subject: p.subject,
        people: p.people.map((r) => `${r.employee.name} (${r.done}/${r.due})`),
      })),
    });
  }

  let sent = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const email of plan) {
    if (!email.to) {
      skipped.push(`${email.kind}:${email.recipientName} (no address)`);
      continue;
    }
    const to = live ? email.to : owner.email;
    const subject = live ? email.subject : `[Preview → ${email.recipientName}] ${email.subject}`;

    /* SP1 FIRST, compliance under it. `buildDccReportHtml` already clips itself
       to stay inside Gmail's 100 KB limit; the SP1 block is small and fixed
       (23 rows per person), so prepending it cannot be what pushes an email
       over — but it is counted below so a very large team still degrades
       predictably rather than arriving clipped by Gmail. */
    const sp1 = sp1Missing
      ? ""
      : sp1EmailSection({
          rows: sp1Rows,
          people: email.people.map((r) => ({ id: r.employee.id, name: r.employee.name })),
          dayLabel,
        });
    const html =
      sp1 +
      buildDccReportHtml(email, day, {
        siteUrl,
        previewFor: live ? null : `${email.recipientName} <${email.to}>`,
      });

    const res = await sendDccDailyReportEmail({ to, subject, html });
    if (res.error) {
      console.error(
        `[cron/dcc-daily-report] ${email.kind} for ${email.recipientName} failed:`,
        res.error,
      );
      failed.push(`${email.kind}:${email.recipientName}`);
    } else {
      sent++;
    }
    await sleep(SEND_GAP_MS);
  }

  return NextResponse.json({ ok: true, day, live, planned: plan.length, sent, skipped, failed });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
