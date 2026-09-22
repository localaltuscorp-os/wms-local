import { NextResponse } from "next/server";
import { publishDueBroadcasts } from "@/lib/ecos/publish-due";

/**
 * ECOS scheduled-publish cron (daily). The BACKSTOP: broadcasts normally go out
 * within about a minute of their time via the popup poll's trigger
 * (lib/ecos/publish-due-trigger); this run catches anything due while nobody
 * had the app open. The work itself — claiming, publishing, cloning repeats and
 * re-arming them — lives in lib/ecos/publish-due so both paths share it.
 * Idempotent: publishes strictly by due date. Vercel sets the Bearer header.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await publishDueBroadcasts(new Date());
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
