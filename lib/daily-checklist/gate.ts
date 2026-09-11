import "server-only";
import {
  todayYmd,
  countPlannedItems,
  countPlannedWork,
  hasStartedDay,
} from "@/lib/queries/daily-checklist";
import { isExemptFromDailyStart } from "@/lib/security/capabilities";
import { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";

/**
 * WHO THE GATE IS BEING ASKED ABOUT.
 *
 * The gates used to take a bare `employeeId`. They now take the identity,
 * because the daily-start EXEMPTION is keyed on `employees.email` — the same
 * key every other per-person rule in this codebase uses (the capability
 * registry, the holiday admins, the super-admins), since a uuid differs between
 * environments and fails silently when it is stale.
 *
 * Making it a required parameter is the point. A future caller cannot resolve
 * the gate without supplying who it is about, so it cannot accidentally ask the
 * un-exempted question — which is exactly how an exception ends up applying on
 * one surface and not another.
 */
export interface GateSubject {
  id: string;
  email: string;
}

/**
 * THE DAILY-START EXEMPTION, applied in ONE place.
 *
 * Every gate below short-circuits through this, so the exemption holds for the
 * `(app)` layout, the hub, and anything added later. There is no second copy to
 * keep in step, and no client-side branch that could disagree: the gate
 * components only render because a server gate decided to render them.
 *
 * This is an exception to ENFORCEMENT. The gates are unchanged for everybody
 * else, and the planner itself (/my-day, Start My Day, Finish My Day) still
 * works for the exempt person — they simply are not stopped by it.
 */
function exempt(who: GateSubject): boolean {
  return isExemptFromDailyStart(who.email);
}

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
  who: GateSubject,
  now: Date = new Date(),
): Promise<boolean> {
  if (exempt(who)) return false;
  return (await countPlannedItems(who.id, todayYmd(now))) < MIN_DAILY_ITEMS;
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
  who: GateSubject,
  minItems: number,
  now: Date = new Date(),
): Promise<boolean> {
  if (exempt(who)) return false;
  return (await countPlannedItems(who.id, todayYmd(now))) < minItems;
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
 * NO ROLE EXEMPTIONS — with ONE named exception, the `daily_start.exempt`
 * capability (see `exempt` above and lib/security/capabilities.ts). That is a
 * per-person grant, not a role: being a super-admin or a manager still earns
 * nothing here. PUNCH_PLAN_GATE_OFF remains the way to unblock this for
 * everyone at once if it ever needs to be.
 */
export async function needsDailyPlan(
  who: GateSubject,
  now: Date = new Date(),
): Promise<boolean> {
  if (exempt(who)) return false;
  const ymd = todayYmd(now);
  const [started, count] = await Promise.all([
    hasStartedDay(who.id, ymd),
    countPlannedWork(who.id, ymd),
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
  who: GateSubject,
  now: Date = new Date(),
): Promise<{ have: number; need: number; started: boolean }> {
  // An exempt person has no shortfall to report: the requirement does not apply
  // to them, so "0 of 5" would be a message about a rule they are outside of.
  if (exempt(who)) {
    return { have: MIN_ATTENDANCE_ITEMS, need: MIN_ATTENDANCE_ITEMS, started: true };
  }
  const ymd = todayYmd(now);
  const [started, have] = await Promise.all([
    hasStartedDay(who.id, ymd),
    countPlannedWork(who.id, ymd),
  ]);
  return { have, need: MIN_ATTENDANCE_ITEMS, started };
}
