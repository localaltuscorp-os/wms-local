import { NextResponse } from "next/server";
import { carryUnfinishedForward } from "@/lib/weekly-goals/carry";
import { currentWeekStart, mondayOf, prevWeekStart } from "@/lib/weekly-goals/week";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Monday auto carry-forward — every unfinished weekly goal from the week that
 * just ended is cloned into the new week (progress reset), for everyone. This
 * replaces the manual "Carry → next week" button: a missed weekly goal now rolls
 * over on its own. Idempotent (see `carryUnfinishedForward`), so a re-run or an
 * overlapping fire never duplicates.
 *
 * Auth: Bearer CRON_SECRET (Vercel sets it automatically). Registered Monday
 * ~09:30 IST, just before the Monday "your priorities" email. Kill-switch:
 * WEEKLY_CARRY_OFF=true makes it a no-op.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.WEEKLY_CARRY_OFF === "true") {
    return NextResponse.json({ ok: true, skipped: "WEEKLY_CARRY_OFF" });
  }

  const thisWeek = currentWeekStart();
  const lastWeek = prevWeekStart(mondayOf(thisWeek));

  try {
    const res = await carryUnfinishedForward(lastWeek, thisWeek);
    return NextResponse.json({ ok: true, fromWeek: lastWeek, toWeek: thisWeek, ...res });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
