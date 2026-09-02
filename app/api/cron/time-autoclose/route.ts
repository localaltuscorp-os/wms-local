import { NextResponse } from "next/server";
import { autoCloseStaleSessions } from "@/lib/tasks/time/engine";
import { idleCapMinutes, timeIntelEnabled } from "@/lib/tasks/time/flags";

/**
 * Task Time Intelligence — runaway-session guard. Closes any live work session
 * that has been open longer than the idle cap (default 4h), crediting only up to
 * the cap so a forgotten overnight timer never inflates a person's or a task's
 * totals. The close is logged as `auto_closed` in the timeline. Concurrency is
 * allowed, so this simply sweeps every stale open row. Idempotent; safe to run
 * often. Vercel sets `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!timeIntelEnabled()) return NextResponse.json({ ok: true, skipped: "disabled" });

  const closed = await autoCloseStaleSessions(idleCapMinutes(), new Date());
  return NextResponse.json({ ok: true, closed });
}

export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
