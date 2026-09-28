import { NextResponse } from "next/server";
import { materializeRecurringTrainings } from "@/lib/training/recurrence";

/**
 * Training recurrence materialization cron.
 *
 * Walks every recurring training template and creates the missing dated child
 * session inside a 14-day forward window. Idempotent (the (parent,
 * occurrence_date) check dedupes), so safe to run more than once per day.
 *
 * Authentication: same pattern as the other cron routes —
 *   Authorization: Bearer <CRON_SECRET>
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
    const stats = await materializeRecurringTrainings();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/training-recurrence] failed", err);
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
