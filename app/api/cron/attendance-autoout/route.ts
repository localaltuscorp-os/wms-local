import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, attendanceAuditLog } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { forgottenLogoutHalfDayOn } from "@/lib/goals/flag";
import { AUTO_PUNCH_OUT_STAMP, AUTO_PUNCH_OUT_NOTE } from "@/lib/attendance/auto-punch-out";

/**
 * FORGOTTEN LOGOUT → AUTOMATIC HALF DAY.
 *
 * Runs at 23:59 Asia/Kolkata (`29 18 * * *` UTC — see vercel.json). Anyone who
 * clocked IN today and never clocked OUT gets a SYSTEM out-punch stamped at
 * their clock-in time, so the day finalizes as Half Day (H/D, 0.5) instead of
 * sitting incomplete. Coming in and forgetting to leave costs half a day — not a
 * full one, and not nothing.
 *
 * ── WHY A CRON AND NOT A TIMER ─────────────────────────────────────────────
 * The classification has to happen whether or not anyone is looking: browser
 * closed, app killed, employee offline, nobody signed in, nobody on the
 * Attendance page. So it is a scheduled server job on the platform's existing
 * cron, authenticated by `CRON_SECRET`, and nothing about it depends on a
 * client being open. This route is the project's existing daily attendance
 * reconciliation job, extended — deliberately not a second scheduler.
 *
 * ── WHY 23:59 AND NOT MIDNIGHT ─────────────────────────────────────────────
 * The attendance day is a calendar day in Asia/Kolkata, and `localDateString`
 * resolves "today" in that zone. Running at 23:59 keeps the job inside the day
 * it is closing; a midnight run would compute the NEXT day and close nothing.
 * The one minute of margin is deliberate.
 *
 * ── IDEMPOTENT ─────────────────────────────────────────────────────────────
 * The out-punch is inserted `onConflictDoNothing` against the (employee, day,
 * kind) unique index, so a re-run — or a real clock-out that lands first — never
 * double-writes and never overwrites a legitimate checkout. Only rows this run
 * actually inserted are counted and audited; a second run audits nothing.
 *
 * ── NO CHECK-IN, NO RECORD ─────────────────────────────────────────────────
 * The candidate set is built from clock-INS. Someone who never came in gets no
 * fabricated punch and no fabricated day.
 *
 * ── THE STAMP IS LEGIBLE, NOT A DISGUISE ───────────────────────────────────
 * `source:'admin', reason:'forgot', recordedById:null` — see
 * lib/attendance/auto-punch-out.ts, which owns both the stamp and the test that
 * recognises it. The null `recordedById` is what says "the system did this", so
 * the grader floors the day at half AND the audit trail can say so honestly
 * rather than implying an administrator made the change. A human manager
 * correcting the day carries `recordedById` and is not floored.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!forgottenLogoutHalfDayOn()) {
    return NextResponse.json({ ok: true, skipped: "forgotten_logout_half_day_off" });
  }

  const today = localDateString(TZ);

  // Today's punches (a small daily set — one company). Paired up in JS.
  const rows = await db
    .select({
      employeeId: attendanceLogs.employeeId,
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
    })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.logDate, today));

  const inAt = new Map<string, Date>();
  const hasOut = new Set<string>();
  for (const r of rows) {
    if (r.kind === "in") inAt.set(r.employeeId, r.loggedAt);
    else hasOut.add(r.employeeId);
  }

  // CHECKED IN, NO CHECK-OUT. Nothing else is a candidate: a day with a real
  // clock-out is left entirely alone, and a day with no clock-in is not a day.
  const missing = [...inAt.entries()].filter(([id]) => !hasOut.has(id));

  let closed = 0;
  const failed: string[] = [];

  for (const [employeeId, loggedAt] of missing) {
    try {
      const res = await db
        .insert(attendanceLogs)
        .values({
          employeeId,
          logDate: today,
          kind: "out",
          // = the clock-in time, so the pair reads as ZERO minutes worked. That
          // does NOT grade half-day on its own — the ordinary three-tier rule
          // puts zero below the half-day floor and returns Absent. What makes
          // this a half-day is the grader recognising the stamp below and
          // setting DayContext.autoClosed; see lib/attendance/auto-punch-out.ts.
          loggedAt,
          source: AUTO_PUNCH_OUT_STAMP.source,
          reason: AUTO_PUNCH_OUT_STAMP.reason,
          recordedById: AUTO_PUNCH_OUT_STAMP.recordedById,
          verifyMethod: "none",
          note: AUTO_PUNCH_OUT_NOTE,
        })
        .onConflictDoNothing({
          target: [attendanceLogs.employeeId, attendanceLogs.logDate, attendanceLogs.kind],
        })
        .returning({ id: attendanceLogs.id });

      // EMPTY means the conflict clause absorbed it: a real clock-out landed
      // between the read above and this insert, or this run is a repeat. Either
      // way nothing changed, so nothing is audited — that is what makes a second
      // run a genuine no-op rather than a no-op that still writes history.
      if (res.length === 0) continue;

      closed++;
      await auditAutoClose(employeeId, today, res[0]!.id, loggedAt);
    } catch (err) {
      console.error(`[cron/attendance-autoout] insert failed for ${employeeId}`, err);
      failed.push(employeeId);
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    timezone: TZ,
    candidates: missing.length,
    closed,
    ...(failed.length ? { failed } : {}),
  });
}

/**
 * Record the automatic classification in the existing attendance audit log.
 *
 * ── WHY `actorId` IS THE EMPLOYEE THEMSELVES ───────────────────────────────
 * `attendance_audit_log.actor_id` is NOT NULL and references `employees`, so a
 * system change has no natural actor to name. The alternatives were a synthetic
 * "system" employee row — a real login-shaped record that exists only to be
 * blamed, and that every roster query would then have to exclude — or relaxing
 * the column to nullable, which weakens it for every human change to accommodate
 * this one machine case.
 *
 * So the row is filed against the employee whose day it is, and `basis:
 * "system"` in the authorization context plus `reason: "system_forgotten_logout"`
 * are what actually say who did it. The change log reads it as a system entry
 * and says so, rather than implying an administrator made the change — which was
 * the requirement.
 */
async function auditAutoClose(
  employeeId: string,
  logDate: string,
  attendanceLogId: string,
  loggedAt: Date,
): Promise<void> {
  try {
    const at = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(loggedAt);

    await db.insert(attendanceAuditLog).values({
      attendanceLogId,
      employeeId,
      actorId: employeeId,
      action: "create",
      field: "check_out",
      attendanceDate: logDate,
      punchKind: "out",
      oldValue: null,
      newValue: at,
      reason: "system_forgotten_logout",
      deviceRowId: null,
      deviceLabel: "System (scheduled job)",
      deviceKind: null,
      authorizationContext: {
        basis: "system",
        onBehalfOfOther: false,
        selfWindowOpen: false,
        monthLocked: false,
        monthLockOverridden: false,
        deviceKind: null,
        deviceExempt: false,
        systemJob: "attendance-autoout",
        note: "No clock-out before 23:59 Asia/Kolkata — day classified Half Day automatically.",
      },
    });
  } catch (err) {
    // LOUDLY, but never fatally: the classification itself has already been
    // written, and failing the request would leave the remaining employees
    // unprocessed for the day.
    console.error("[cron/attendance-autoout] audit write failed", { employeeId, logDate, err });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
