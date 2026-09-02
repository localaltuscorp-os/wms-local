import { NextResponse } from "next/server";
import { runFullBackup } from "@/lib/backup/run";

/**
 * Nightly backup cron — mirrors the whole DB into the Google Sheet and all
 * Storage files into the Shared Drive (see lib/backup/run). Scheduled in
 * vercel.json. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets
 * this automatically when CRON_SECRET is configured), same as the other crons.
 *
 * Local/manual test:
 *   curl -X POST https://wms.mananvasa.com/api/cron/backup -H "Authorization: Bearer $CRON_SECRET"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the full backup can take a while

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runFullBackup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/backup] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
