import { NextResponse } from "next/server";
import { runTrainingReminders } from "@/lib/training/reminders";

/**
 * Training & Learning reminder cron.
 *
 * Emits the reminder-kind notifications (target approaching/incomplete, share
 * reminder, recording-incomplete). Idempotent-ish; safe to run daily.
 *
 * Authentication: same pattern as the other cron routes —
 *   Authorization: Bearer <CRON_SECRET>
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
    const stats = await runTrainingReminders();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/training-reminders] failed", err);
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
