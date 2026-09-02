import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { notifications } from "@/db/schema";
import { satCommitGateOn, monApproveGateOn } from "@/lib/goals/flag";
import { currentWeekStart, formatWeekLabel, nextWeekStart } from "@/lib/weekly-goals/week";

/**
 * Goals Cascade reminder cron (migration 0131).
 *
 * Two jobs, selected by `?job=` (set per-entry in vercel.json):
 *   • commit-reminder  — Sat 17:30 IST — nudge every active employee to commit
 *     next week's goals + fill this week's progress before the punch-out gate.
 *   • approve-reminder — Mon 09:00 IST — nudge every manager to approve their
 *     downline's last-week progress + this-week goals before clock-in.
 *
 * Both are GATED on their gate flag: a reminder only fires when the matching
 * gate is live (SAT_COMMIT_GATE_ON / MON_APPROVE_GATE_ON), so there's no
 * reminder noise until the ritual is actually being enforced — and no overlap
 * with the existing weekly-goals cron. In-app inbox pings only (bypasses the
 * notification matrix, like the DCC / ambassador reminders). Vercel sets
 * `Authorization: Bearer <CRON_SECRET>`. Node runtime for postgres-js.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Job = "commit-reminder" | "approve-reminder";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get("job") as Job | null;
  if (job !== "commit-reminder" && job !== "approve-reminder") {
    return NextResponse.json({ ok: true, skipped: "no_matching_job" });
  }

  // Fire only while the matching gate is live — no reminders before enforcement.
  if (job === "commit-reminder" && !satCommitGateOn()) {
    return NextResponse.json({ ok: true, skipped: "sat_commit_gate_off" });
  }
  if (job === "approve-reminder" && !monApproveGateOn()) {
    return NextResponse.json({ ok: true, skipped: "mon_approve_gate_off" });
  }

  const thisWeek = currentWeekStart();

  if (job === "commit-reminder") {
    const active = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.isActive, true));
    const nextLabel = formatWeekLabel(nextWeekStart(thisWeek));
    let sent = 0;
    for (const emp of active) {
      if (await insertNotification(
        emp.id,
        "goals_commit_reminder",
        "Commit next week's goals",
        `Freeze your goals for ${nextLabel} and fill this week's progress before you clock out.`,
      )) sent++;
    }
    return NextResponse.json({ ok: true, job, processed: active.length, sent });
  }

  // approve-reminder — everyone who is a manager (someone's active manager_id).
  const managers = await db
    .selectDistinct({ id: employees.managerId })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.managerId)));
  const thisLabel = formatWeekLabel(thisWeek);
  let sent = 0;
  for (const m of managers) {
    if (!m.id) continue;
    if (await insertNotification(
      m.id,
      "goals_approval_reminder",
      "Approve your team's goals",
      `Approve your team's last-week progress and their goals for ${thisLabel} before you clock in.`,
    )) sent++;
  }
  return NextResponse.json({ ok: true, job, managers: managers.length, sent });
}

async function insertNotification(
  userId: string,
  kind: "goals_commit_reminder" | "goals_approval_reminder",
  title: string,
  body: string,
): Promise<boolean> {
  try {
    await db.insert(notifications).values({ userId, kind, title, body });
    return true;
  } catch (err) {
    console.error(`[cron/goals] notification insert failed for ${userId}`, err);
    return false;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
