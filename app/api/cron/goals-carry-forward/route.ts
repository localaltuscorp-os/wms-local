import { NextResponse } from "next/server";
import { carryForwardUnreviewed } from "@/lib/goals/carry-forward";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * END-OF-DAY CARRY FORWARD — every commitment left unreviewed on a day that has
 * ended moves to today, still open (Sir). See `carryForwardUnreviewed` for what
 * counts as "reviewed" and why an explicit action can never be overridden.
 *
 * TIMING: 18:45 UTC = 00:15 IST, just after the business day rolls over. It has
 * to run AFTER midnight IST, not at 23:00 the evening before — the sweep moves
 * rows off days that are already PAST, and until midnight today is not past.
 * Nothing moves while the day is still in progress (rule 11).
 *
 * Runs for EVERYONE (no employee filter), and every date it touches comes from
 * the app's IST business day, never from a caller's session (rules 10 + 12).
 *
 * Idempotent, so a retry, an overlapping fire, and the same sweep running lazily
 * when someone opens Plan My Day all converge on the same result.
 *
 * Auth: Bearer CRON_SECRET (Vercel sets it automatically). Kill-switch:
 * GOALS_CARRY_FORWARD_OFF=true makes it a no-op.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.GOALS_CARRY_FORWARD_OFF === "true") {
    return NextResponse.json({ ok: true, skipped: "GOALS_CARRY_FORWARD_OFF" });
  }

  try {
    const res = await carryForwardUnreviewed();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
