import { NextResponse } from "next/server";
import { runRelay } from "@/lib/relay/run";

/**
 * Phase B — the relay cron. Publishes new events from the log to every
 * projection/command consumer and drains the command worker. This is the
 * DURABLE backstop: even if the after-commit nudge (lib/relay/nudge.ts) is
 * dropped, the cron catches the log up on its next tick, so no event is ever
 * lost (at-least-once, Law 7).
 *
 * Scheduled DAILY in vercel.json (Vercel rejects sub-daily cron frequencies on
 * this plan — every other cron here is daily too). Real-time freshness comes
 * from the after-commit nudge (lib/relay/nudge.ts) on every mutation; this cron
 * is the catch-up backstop. When an engine's READ is eventually cut over to a
 * projection, run the relay more often via an external scheduler (the repo also
 * deploys to Railway, which has no sub-daily restriction). Auth mirrors the
 * other crons:
 *   Authorization: Bearer <CRON_SECRET>
 * Local:
 *   curl -X POST http://localhost:3000/api/cron/relay -H "Authorization: Bearer $CRON_SECRET"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRelay();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/relay] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
