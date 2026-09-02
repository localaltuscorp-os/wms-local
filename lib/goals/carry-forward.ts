import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/db/schema";
import { todayYmd, ymdForOffset } from "@/lib/queries/daily-checklist";

/**
 * AUTOMATIC END-OF-DAY CARRY FORWARD (Sir).
 *
 * "The employee should never lose an unfinished task simply because they forgot
 * to review it." A commitment left untouched when its day ends moves to the next
 * day, still open, still the same record.
 *
 * ── WHAT COUNTS AS REVIEWED ───────────────────────────────────────────────
 * Every review action already writes one of three things, so no new state
 * machine is needed and an explicit action ALWAYS wins:
 *
 *   Mark Done            → done = true
 *   Pending              → closed_at stamped (done stays false)
 *   Tomorrow / Day after → plan_date already moved forward
 *   × (Recycle Bin)      → abandoned_at stamped
 *
 * "Unreviewed" is therefore the exact complement: still sitting on a PAST
 * plan_date with done = false, closed_at NULL and abandoned_at NULL. Each of the
 * four actions above removes a row from that set, which is why this can never
 * override one of them (rule 2).
 *
 * ── ONLY THE DAY THAT JUST ENDED ──────────────────────────────────────────
 * The window is YESTERDAY, not "everything still in the past". Running nightly,
 * that chains naturally: a commitment nobody touches walks forward a day at a
 * time and is always on today when its owner returns.
 *
 * Sweeping all of history instead looks equivalent but is not — on its first run
 * against an existing database it empties months of stale rows onto today (657
 * of them, when this was measured here), burying the day it was meant to
 * protect. Older rows stay where they are and remain reachable through the
 * Unfinished box, exactly as before this feature existed.
 *
 * ── IDEMPOTENT BY CONSTRUCTION (rules 9 + 16) ─────────────────────────────
 * It is an UPDATE of plan_date on the SAME row (never an insert, so no
 * duplicates — rule 8). Once moved the row is no longer on a past day, so a
 * second run in the same day matches nothing. Safe to run repeatedly, from the
 * cron and from the page load, in any order.
 *
 * ── TIMEZONE (rules 10 + 12) ──────────────────────────────────────────────
 * "Today" is `todayYmd()`, the app's IST business day — the same function every
 * other planner query uses. It is derived from the DATA, never from the caller's
 * session, so a manager in another timezone opening someone's plan carries that
 * employee's day, not their own.
 */

export interface CarryForwardResult {
  /** How many commitments were moved. */
  moved: number;
  /** The day they came from (IST "YYYY-MM-DD"). */
  fromYmd: string;
  /** The day they were moved onto (IST "YYYY-MM-DD"). */
  toYmd: string;
}

/**
 * Sweep one employee's stranded commitments onto today.
 *
 * `employeeId` omitted ⇒ every employee (the nightly cron).
 */
export async function carryForwardUnreviewed(
  employeeId?: string,
  now: Date = new Date(),
): Promise<CarryForwardResult> {
  const today = todayYmd(now);
  // The single day that just ended. Today is never touched: it isn't over
  // yet (rule 11), and anything older is deliberately out of scope — see the
  // note above.
  const yesterday = ymdForOffset(-1, now);

  const unreviewed = and(
    eq(dailyChecklist.planDate, yesterday),
    eq(dailyChecklist.done, false),
    isNull(dailyChecklist.closedAt),
    isNull(dailyChecklist.abandonedAt),
    ...(employeeId ? [eq(dailyChecklist.employeeId, employeeId)] : []),
  );

  const moved = await db
    .update(dailyChecklist)
    .set({
      planDate: today,
      // Where it came FROM — the day it was actually planned and missed. This is
      // what the card shows as "carried forward from 19 Aug".
      movedFromDate: sql`${dailyChecklist.planDate}`,
      // Records that the SYSTEM moved it, not the person. `moved_from_date`
      // alone can't tell the two apart — a manual "→ Tomorrow" sets it too.
      carriedForwardAt: new Date(),
      // Status is deliberately untouched: it stays OPEN (rule 4). Not done, not
      // pending, not cancelled.
      updatedAt: new Date(),
      // Append to the end of today's list so it doesn't jump the queue.
      position: sql`(
        select coalesce(max(dc2.position), 0) + 1
          from daily_checklist dc2
         where dc2.employee_id = ${dailyChecklist.employeeId}
           and dc2.plan_date = ${today}
      )`,
    })
    .where(unreviewed)
    .returning({ id: dailyChecklist.id });

  return { moved: moved.length, fromYmd: yesterday, toYmd: today };
}
