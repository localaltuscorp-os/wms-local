"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  runAttendanceSheetSync,
  type AttendanceSheetSyncSummary,
} from "@/lib/attendance-log/attendance-sync";
import {
  runPaidLeaveSync,
  type PaidLeaveSyncSummary,
} from "@/lib/attendance-log/paid-leave-sync";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Admin "Refresh now" actions for the HR "Attendance log" Google Sheet mirror
 * (same engines as /api/cron/attendance-log-sync; both are idempotent,
 * audit-logged in sync_runs, and NON-DESTRUCTIVE — they populate the parallel
 * attendance_sheet_* / paid_leave_cycle read layer and never touch
 * attendance_logs, punch grading or the leave module).
 *
 * Pass { dryRun: true } to preview: the engine reads + maps + reports what
 * WOULD change (insert/update/unmatched counts + sample keys) and writes only
 * its dry_run audit row.
 *
 * The returned summaries are safe to show verbatim — counts and names only,
 * never sheet row contents.
 */
export async function refreshAttendanceSheetNow(opts?: {
  dryRun?: boolean;
}): Promise<ActionResult<{ summary: AttendanceSheetSyncSummary }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const result = await runAttendanceSheetSync({
    trigger: "admin",
    actorId: me.id,
    dryRun: opts?.dryRun === true,
  });
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.dryRun) revalidatePath("/attendance");
  const { ok: _ok, ...summary } = result;
  return { ok: true, summary };
}

export async function refreshPaidLeaveNow(opts?: {
  dryRun?: boolean;
}): Promise<ActionResult<{ summary: PaidLeaveSyncSummary }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const result = await runPaidLeaveSync({
    trigger: "admin",
    actorId: me.id,
    dryRun: opts?.dryRun === true,
  });
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.dryRun) revalidatePath("/attendance");
  const { ok: _ok, ...summary } = result;
  return { ok: true, summary };
}
