import { NextResponse } from "next/server";
import { listTasksNeedingCalendarSync, reconcileTaskEvent } from "@/lib/google/sync";

/**
 * Durable Google Calendar sync. Every run it finds tasks whose calendar event
 * is out of sync (create / update / reassign / tear-down), retry-eligible by
 * backoff, and reconciles each — sequentially, to stay under Google's rate
 * limit. This is the RELIABLE path (runs in a clean route-handler context with
 * full retries + logging), backstopping the best-effort live `after()` sync.
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

  let ids: string[] = [];
  try {
    ids = await listTasksNeedingCalendarSync(40);
  } catch (err) {
    console.error("[cron/calendar-sync] candidate query failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "candidate query failed" }, { status: 500 });
  }

  for (const id of ids) {
    await reconcileTaskEvent(id); // records its own success/failure state; never throws
  }
  return NextResponse.json({ ok: true, processed: ids.length });
}

export async function GET(request: Request): Promise<NextResponse> { return run(request); }
export async function POST(request: Request): Promise<NextResponse> { return run(request); }
