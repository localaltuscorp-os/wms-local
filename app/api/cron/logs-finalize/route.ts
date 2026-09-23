import { NextResponse } from "next/server";
import { finalizeStaleDailySessions } from "@/lib/logs/sessions";

/**
 * GET/POST /api/cron/logs-finalize — MIDNIGHT FINALIZATION.
 *
 * After 00:00 IST this closes every daily_sessions row whose date is before
 * today and is not already `finalized`, stamping NOT_RECORDED where the day
 * ended without a logout event. Idempotent and safe to re-run, so a missed
 * cron is repaired by the next execution. It does NOT log anyone out — the auth
 * session is separate from this rollup; a user still signed in across midnight
 * simply starts accumulating on the new day's session.
 *
 * Vercel sets `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await finalizeStaleDailySessions(new Date());
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
