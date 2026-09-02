import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, tasks } from "@/db/schema";
import { todayYmd } from "@/lib/queries/daily-checklist";

/**
 * DAILY SCORE (Sir, 2026-08) — "3/5 done, 8/10 done, and further break up to
 * 3 Fresh Done, 5 pending-from-before Done … and give a report of original
 * target date vs actual done date, so we know on average the person finishes his
 * tasks with a 3-day delay."
 *
 * FRESH vs CARRIED is read off `moved_from_date`: a row that has been re-dated
 * onto this day was owed from an earlier one. That is exactly what the planner
 * writes when work is pushed forward, so the split needs no extra bookkeeping.
 *
 * The DELAY average deliberately measures against the task's ORIGINAL commitment
 * (its effective due date), not the day it happened to be re-planned onto —
 * otherwise pushing something forward would keep resetting its own deadline and
 * every delay would read as zero.
 */
export interface DailyScore {
  ymd: string;
  /** Today: how many of the day's plan are done. */
  today: { done: number; total: number };
  /** The trailing window (default 14 days). */
  window: { done: number; total: number; days: number };
  /** Done today, planned today. */
  freshDone: number;
  /** Done today, but carried in from an earlier day. */
  carriedDone: number;
  /** Still open on today's plan. */
  openToday: number;
  /**
   * Average whole-day gap between a task's ORIGINAL due date and the day it was
   * actually completed, over the window. Positive = finishing late. Null when no
   * completed item in the window had a due date to measure against.
   */
  avgDelayDays: number | null;
  /** How many completed items the average is based on — context for the number. */
  delaySamples: number;
  /** Completed EARLY or on time, in the window. */
  onTimeCount: number;
}

const WINDOW_DAYS = 14;

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export async function getDailyScore(
  employeeId: string,
  now: Date = new Date(),
): Promise<DailyScore> {
  const ymd = todayYmd(now);
  const from = shiftYmd(ymd, -(WINDOW_DAYS - 1));

  const rows = await db
    .select({
      planDate: dailyChecklist.planDate,
      done: dailyChecklist.done,
      movedFrom: dailyChecklist.movedFromDate,
      closedAt: dailyChecklist.closedAt,
      // The ORIGINAL commitment for task-linked rows: the revised date when one
      // was agreed, else the original due date.
      dueAt: sql<string | null>`coalesce(${tasks.revisedTargetDate}, ${tasks.dueAt})`,
    })
    .from(dailyChecklist)
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        gte(dailyChecklist.planDate, from),
        lte(dailyChecklist.planDate, ymd),
      ),
    );

  let todayDone = 0;
  let todayTotal = 0;
  let windowDone = 0;
  let freshDone = 0;
  let carriedDone = 0;
  let delaySum = 0;
  let delaySamples = 0;
  let onTimeCount = 0;

  const dayNum = (v: string) => Math.floor(new Date(`${v.slice(0, 10)}T00:00:00Z`).getTime() / 86_400_000);

  for (const r of rows) {
    const isToday = String(r.planDate) === ymd;
    if (isToday) {
      todayTotal += 1;
      if (r.done) {
        todayDone += 1;
        if (r.movedFrom) carriedDone += 1;
        else freshDone += 1;
      }
    }
    if (r.done) windowDone += 1;

    // Delay: original due → the day it was actually completed.
    if (r.done && r.dueAt) {
      const completedYmd = r.closedAt
        ? new Date(r.closedAt).toISOString().slice(0, 10)
        : String(r.planDate);
      const delta = dayNum(completedYmd) - dayNum(String(r.dueAt));
      delaySum += delta;
      delaySamples += 1;
      if (delta <= 0) onTimeCount += 1;
    }
  }

  return {
    ymd,
    today: { done: todayDone, total: todayTotal },
    window: { done: windowDone, total: rows.length, days: WINDOW_DAYS },
    freshDone,
    carriedDone,
    openToday: Math.max(0, todayTotal - todayDone),
    avgDelayDays: delaySamples > 0 ? Math.round((delaySum / delaySamples) * 10) / 10 : null,
    delaySamples,
    onTimeCount,
  };
}
