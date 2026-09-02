import { NextResponse } from "next/server";
import { runSalaryBreakupSync } from "@/lib/salary/breakup-sync";

/**
 * Salary-sheet live sync cron — mirrors the HR salary Google Sheet into
 * `salary_breakup` (see lib/salary/breakup-sync.ts) so month-end pay always
 * reflects the sheet without anyone re-running an importer.
 *
 * NOT YET SCHEDULED: add to vercel.json once SALARY_SHEET_ID/RANGE are set,
 * off-peak per the DB load-path rule, e.g.
 *   { "path": "/api/cron/salary-sync", "schedule": "0 21 * * *" }   // 02:30 IST
 * Until then this route is inert (config check no-ops it) and, like every
 * cron, unreachable without the CRON_SECRET bearer.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets this
 * automatically). Kill switch: SALARY_SYNC_OFF=true.
 *
 * Manual test:
 *   curl -X POST https://wms.mananvasa.com/api/cron/salary-sync -H "Authorization: Bearer $CRON_SECRET"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(request: Request): Promise<NextResponse> {
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSalaryBreakupSync({ trigger: "cron" });
    // Counts + names only in the response — never salary row contents.
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error("[cron/salary-sync] failed", err);
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
