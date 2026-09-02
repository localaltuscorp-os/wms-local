import { NextResponse } from "next/server";
import { runTaskAutoArchive } from "@/lib/tasks/auto-archive";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AUTO-ARCHIVE SWEEP — approved tasks move to Archive seven working days after
 * sign-off. See lib/tasks/auto-archive.ts for which days count and why the
 * answer differs from the rest of the app.
 *
 * TIMING: daily rather than hourly. The window is measured in WHOLE days, so a
 * task's eligibility can only change at a date boundary — running twelve times
 * a day would do the same work twelve times and change nothing eleven of them.
 *
 * Idempotent, so a retry, an overlapping fire and a manual invocation all
 * converge on the same state.
 *
 * Auth: Bearer CRON_SECRET (Vercel sets it automatically), matching every other
 * cron route here. Kill-switch: TASK_AUTO_ARCHIVE_OFF=true makes it a no-op —
 * worth having on a job that mutates rows nobody asked it to touch.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.TASK_AUTO_ARCHIVE_OFF === "true") {
    return NextResponse.json({ ok: true, skipped: "TASK_AUTO_ARCHIVE_OFF" });
  }

  try {
    const res = await runTaskAutoArchive();
    // The ids come back so a failed follow-up is diagnosable from the cron log
    // alone, without re-deriving which rows the sweep chose.
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
