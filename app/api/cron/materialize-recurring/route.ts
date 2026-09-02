import { NextResponse } from "next/server";
import { materializeRecurringTasks } from "@/lib/recurrence/materialize";

/**
 * Phase 5.2 — recurrence materialization cron.
 *
 * Walks every active recurring template and creates the missing dated
 * child instances inside a 14-day forward window. Idempotent (the
 * unique partial index on `tasks(recurrence_parent_id, recurrence_occurrence_date)`
 * dedupes), so safe to run more than once per day.
 *
 * Authentication: same pattern as the other cron routes —
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Schedule: registered in `vercel.json` to run daily at 02:00 UTC
 * (about 07:30 IST — quietly outside the daily-digest 03:30 UTC slot).
 *
 * Runs on the Node runtime (postgres-js needs Node APIs).
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
    const stats = await materializeRecurringTasks();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/materialize-recurring] failed", err);
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
