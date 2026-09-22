import { NextResponse } from "next/server";
import { runScheduledDriveSync } from "@/lib/hr/records-export/sync";

/**
 * Nightly check for the scheduled HR Records → Google Drive save. Scheduled in
 * vercel.json at 21:30 UTC (03:00 IST); lib/hr/records-export/schedule.ts
 * decides whether tonight is the night. A save too big for one invocation
 * leaves its place and the next night continues it.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, same as every other cron.
 *
 * Manual test:
 *   curl -X POST https://os.altuscorp.in/api/cron/hr-records-drive -H "Authorization: Bearer $CRON_SECRET"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const outcome = await runScheduledDriveSync(BUDGET_MS);
    const failed = outcome.ran && outcome.result.status === "error";
    return NextResponse.json({ ok: !failed, ...outcome }, { status: failed ? 500 : 200 });
  } catch (err) {
    console.error("[cron/hr-records-drive] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
