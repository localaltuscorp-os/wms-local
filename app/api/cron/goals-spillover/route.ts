import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { goals } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import { cloneForward } from "@/lib/goals/carry";
import { goalsSpilloverOn } from "@/lib/goals/flag";

/**
 * Auto-spillover (Sir #24) — on the 1st, any month goal from the just-ended month
 * that isn't 100% done is cloned into the new month with its balance % retained.
 * The clone carries `clonedFromId`, so the board renders it RED ("spilled over").
 * Idempotent: a goal already cloned into the target month is skipped.
 *
 * DEFAULT OFF via `GOALS_SPILLOVER_ON` — a no-op until flipped. Auth: Bearer
 * CRON_SECRET. Registered `0 3 1 * *` (1st, ~08:30 IST). Node runtime.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** { prev:'YYYY-MM' (source), cur:'YYYY-MM' (target) } in IST. */
function monthWindow(now: Date): { prev: string; cur: string } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const cur = ist.toISOString().slice(0, 7);
  ist.setUTCDate(1);
  ist.setUTCMonth(ist.getUTCMonth() - 1);
  return { prev: ist.toISOString().slice(0, 7), cur };
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!goalsSpilloverOn()) {
    return NextResponse.json({ ok: true, skipped: "GOALS_SPILLOVER_ON is off" });
  }

  const { prev, cur } = monthWindow(new Date());
  const roster = await db.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true));

  let scanned = 0;
  let spilled = 0;
  for (const emp of roster) {
    let monthGoals;
    try {
      monthGoals = await getPeriodGoals(emp.id, "month", prev);
    } catch {
      continue;
    }
    for (const g of monthGoals) {
      const effective = g.acceptPct ?? g.pctDone;
      if (effective >= 100) continue;
      scanned++;
      try {
        // Idempotency — already spilled into the target month?
        const [dupe] = await db
          .select({ id: goals.id })
          .from(goals)
          .where(and(eq(goals.clonedFromId, g.id), eq(goals.periodKey, cur)))
          .limit(1);
        if (dupe) continue;
        const res = await cloneForward(g.id, cur, { retainProgress: true, actorId: emp.id });
        if (res.ok) spilled++;
      } catch (err) {
        console.error(`[cron/goals-spillover] failed for goal ${g.id}`, err);
      }
    }
  }

  return NextResponse.json({ ok: true, from: prev, to: cur, scanned, spilled });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
