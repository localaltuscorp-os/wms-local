import { NextResponse } from "next/server";
import { retryFailedDispatches } from "@/lib/notifications/retry";

/**
 * Phase 2.1 — retry the failed notification dispatch log rows.
 *
 * Picks up to 50 rows where `status='failed' AND next_attempt_at <= now()
 * AND attempt_count < 3` (set in `notification_dispatch_log`), re-runs
 * each row's single channel, and updates the row with the new outcome.
 * Rows that hit the attempt cap are stamped `failed_terminal` and stop
 * being picked.
 *
 * Authentication: same pattern as `/api/cron/digest` — requires
 *   Authorization: Bearer <CRON_SECRET>
 * which Vercel Cron supplies automatically when CRON_SECRET is set in
 * the project's env. Local testing:
 *   curl -X POST http://localhost:3000/api/cron/retry-dispatch \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Runs on the Node runtime — postgres-js needs Node APIs.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection so we never reveal whether the env var is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await retryFailedDispatches({ limit: 50 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/retry-dispatch] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Both GET (Vercel Cron's default) and POST (testability) accepted.
export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
