import { NextResponse } from "next/server";
import { runAttendanceSheetSync } from "@/lib/attendance-log/attendance-sync";
import { runPaidLeaveSync } from "@/lib/attendance-log/paid-leave-sync";

/**
 * "Attendance log" sheet live-sync cron — mirrors BOTH authoritative tabs of
 * the HR workbook into the parallel read layer:
 *   · "Attendance Sheet"       → attendance_sheet_month + attendance_sheet_day
 *   · "PAID LEAVE CALCULATION" → paid_leave_cycle
 * (engines: lib/attendance-log/attendance-sync.ts + paid-leave-sync.ts —
 * idempotent, audit-logged in sync_runs, never touch attendance_logs/leave).
 *
 * SCHEDULED in vercel.json weekly, off-peak per the DB load-path rule:
 *   { "path": "/api/cron/attendance-log-sync", "schedule": "30 21 * * 0" }  // Sun 03:00 IST
 * Like every cron it is unreachable without the CRON_SECRET bearer.
 * Kill switch: ATT_LOG_SYNC_OFF=true (both engines).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets this
 * automatically).
 *
 * Manual test:
 *   curl -X POST https://wms.mananvasa.com/api/cron/attendance-log-sync -H "Authorization: Bearer $CRON_SECRET"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<NextResponse> {
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Sequential on purpose — one pooled connection profile, no burst.
    const attendance = await runAttendanceSheetSync({ trigger: "cron" });
    const paidLeave = await runPaidLeaveSync({ trigger: "cron" });
    const ok = attendance.ok && paidLeave.ok;
    // Counts + names only in the response — never sheet row contents.
    return NextResponse.json({ ok, attendance, paidLeave }, { status: ok ? 200 : 500 });
  } catch (err) {
    console.error("[cron/attendance-log-sync] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
