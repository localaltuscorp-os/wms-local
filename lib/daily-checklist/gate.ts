import "server-only";
import {
  todayYmd,
  countPlannedItems,
  countPlannedWork,
  hasStartedDay,
} from "@/lib/queries/daily-checklist";
import { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";

/**
 * Daily-checklist gate for the compulsory post-login wall: the day is planned
 * once there are ≥ MIN_DAILY_ITEMS items on today's plan.
 *
 * CRITICAL — counts `countPlannedItems` = the employee's COMMITTED items
 * (daily_checklist rows for today: personal items + tasks they actively pulled).
 * The client gate counts the SAME set (items where source === "personal"), so
 * the two can never disagree. Merely-assigned tasks due today do NOT count —
 * the user must ACTIVELY commit ≥ MIN, which is the whole point of the plan gate
 * (they show up as a pull-pool, not as pre-filled plan).
 */
export async function needsDailyChecklistPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await countPlannedItems(employeeId, todayYmd(now))) < MIN_DAILY_ITEMS;
}

/**
 * Role-based variant for the redesigned Plan-Your-Day (Goals Module 4). The
 * committed minimum differs by role — 3 for individual contributors, 5 for
 * managers (design §4) — so the caller passes `minItems`. Counts the SAME
 * `countPlannedItems` set as the legacy gate + the planner writes (daily_checklist
 * commits), so the gate and the /goals/plan surface can never drift. Used only
 * behind `planGateOn()`; the legacy `needsDailyChecklistPlan` is untouched.
 */
export async function needsGoalsPlanCommit(
  employeeId: string,
  minItems: number,
  now: Date = new Date(),
): Promise<boolean> {
  return (await countPlannedItems(employeeId, todayYmd(now))) < minItems;
}

/**
 * Daily-plan gate for ATTENDANCE: nobody marks themselves present without a real
 * plan for the day, and without having actually STARTED it.
 *
 * TWO conditions, both required (Sir):
 *   1. at least `MIN_ATTENDANCE_ITEMS` things lined up for today, and
 *   2. "Start My Day" clicked on WMS › Plan My Day (daily_plan_day.started_at).
 *
 * The second is the point of the rule. A plan you never started is a list, not a
 * commitment — the click is the commitment, and attendance follows it. Counting
 * items alone would let someone drift into the day with a plan they never opened.
 *
 * WHAT COUNTS toward (1) — anything on today's plan, plus assigned work due
 * today: pulled weekly goals, pulled Y/Q/M goals, pulled WMS tasks, typed daily
 * commitments, yesterday's unfinished carried onto today, and open assigned
 * tasks due (or overdue) today. `countPlannedWork` dedupes the overlap.
 *
 * ⚠ THIS IS STRICTER THAN WHAT IT REPLACED, deliberately. It once asked for ONE
 * item (`hasPlannedWork`) and advertised that nobody who could clock in before
 * would be newly blocked. That is no longer true, and is not meant to be.
 *
 * NO ROLE EXEMPTIONS. See punchPlanGateOn — PUNCH_PLAN_GATE_OFF is the only way
 * out if this ever needs unblocking in production.
 */
export async function needsDailyPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const ymd = todayYmd(now);
  const [started, count] = await Promise.all([
    hasStartedDay(employeeId, ymd),
    countPlannedWork(employeeId, ymd),
  ]);
  return !started || count < MIN_ATTENDANCE_ITEMS;
}

/**
 * WHY the punch was refused, for messaging. Returns the count, the requirement
 * and whether the day was started, so the punch can say "3 of 5" or "hit Start
 * My Day" instead of merely refusing — a gate that will not say what is missing
 * makes people guess, and the two failures have different fixes.
 */
export async function dailyPlanShortfall(
  employeeId: string,
  now: Date = new Date(),
): Promise<{ have: number; need: number; started: boolean }> {
  const ymd = todayYmd(now);
  const [started, have] = await Promise.all([
    hasStartedDay(employeeId, ymd),
    countPlannedWork(employeeId, ymd),
  ]);
  return { have, need: MIN_ATTENDANCE_ITEMS, started };
}
