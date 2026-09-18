import { NextResponse } from "next/server";
import { syncDccCalendar } from "@/lib/dcc/calendar-sync";
import { reconcileDccMasters } from "@/lib/dcc/master-sync";

/**
 * DCC → Google Calendar, the reliable path (lib/dcc/calendar-sync.ts).
 *
 * Runs just after midnight IST, putting today's DCC event on every connected
 * calendar and settling yesterday's final state, and again at midday. Every
 * run checks each person's whole DCC history, so a day the live sync missed,
 * or a person who connected while a backfill was cut short, is caught here.
 * An unchanged day costs no Google call.
 *
 *   ?dryRun=1        count what would change; call nothing, write nothing
 *   ?employee=<id>   one person only
 *   ?from= / ?to=    YYYY-MM-DD window
 *
 * Vercel sets `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const YMD = /^\d{4}-\d{2}-\d{2}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams;
  const employee = q.get("employee");
  const from = q.get("from");
  const to = q.get("to");
  if ((employee && !UUID.test(employee)) || (from && !YMD.test(from)) || (to && !YMD.test(to))) {
    return NextResponse.json({ ok: false, error: "Bad employee / from / to." }, { status: 400 });
  }

  try {
    // DCC Masters first (lib/dcc/master-sync.ts): a designation changed by any
    // route reaches that person's KPIs — and so their calendar — by this run.
    const masters = q.get("dryRun") === "1"
      ? null
      : await reconcileDccMasters().catch((err: unknown) => {
          console.error("[cron/dcc-calendar-sync] master reconcile failed", err instanceof Error ? err.message : err);
          return null;
        });
    const stats = await syncDccCalendar({
      employeeIds: employee ? [employee] : undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      budgetMs: 240_000,
      dryRun: q.get("dryRun") === "1",
    });
    return NextResponse.json({ ok: true, dryRun: q.get("dryRun") === "1", masters, ...stats });
  } catch (err) {
    console.error("[cron/dcc-calendar-sync] failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> { return run(request); }
export async function POST(request: Request): Promise<NextResponse> { return run(request); }
