/**
 * When the scheduled Drive save is due. Pure and client-safe, so the settings
 * screen shows exactly the date the cron will act on.
 *
 * The cron (vercel.json → /api/cron/hr-records-drive) fires once a day at
 * 21:30 UTC = 03:00 IST and asks `isScheduledRunDue`. All calendar maths is in
 * India time: "the 1st" means the 1st in Mumbai, not in UTC.
 *
 * "Every N months on day D" is measured from the last COMPLETED save, by
 * calendar month. A manual "save now" therefore counts: saving by hand on the
 * 20th of September with a monthly schedule still runs on 1 October, but
 * saving by hand on the 1st does not produce a second save that same night.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
export const CRON_UTC_HOUR = 21;
export const CRON_UTC_MINUTE = 30;

export interface ScheduleInput {
  enabled: boolean;
  intervalMonths: number;
  dayOfMonth: number;
  lastCompletedAt: Date | null;
}

export function clampInterval(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.min(12, Math.max(1, Math.round(v))) : 1;
}

/** 1–28: every month has a 28th, so the schedule never silently skips February. */
export function clampDay(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.min(28, Math.max(1, Math.round(v))) : 1;
}

function ist(d: Date): { y: number; m: number; day: number } {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate() };
}

const monthIndex = (p: { y: number; m: number }) => p.y * 12 + p.m;

export function isScheduledRunDue(s: ScheduleInput, now: Date): boolean {
  if (!s.enabled) return false;
  const today = ist(now);
  const day = clampDay(s.dayOfMonth);
  if (!s.lastCompletedAt) return today.day >= day;
  const gap = monthIndex(today) - monthIndex(ist(s.lastCompletedAt));
  const interval = clampInterval(s.intervalMonths);
  // A whole cycle was missed (the cron was down, the account disconnected) —
  // catch up now instead of waiting for the day to come round again.
  if (gap > interval) return true;
  return gap === interval && today.day >= day;
}

/** The first cron firing strictly after `now`. */
export function nextCronAfter(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_UTC_HOUR, CRON_UTC_MINUTE),
  );
  return d.getTime() > now.getTime() ? d : new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

/** When the next scheduled save will start, or null when the schedule is off. */
export function nextScheduledRun(s: ScheduleInput, now: Date): Date | null {
  if (!s.enabled) return null;
  if (isScheduledRunDue(s, now)) return nextCronAfter(now);
  const today = ist(now);
  let target = monthIndex(today);
  if (s.lastCompletedAt) {
    target = Math.max(monthIndex(ist(s.lastCompletedAt)) + clampInterval(s.intervalMonths), target);
  }
  const y = Math.floor(target / 12);
  const m = target % 12;
  // 03:00 IST on day D is 21:30 UTC on D-1 — the cron that answers "is it due".
  return new Date(Date.UTC(y, m, clampDay(s.dayOfMonth), 3, 0) - IST_OFFSET_MS);
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function describeSchedule(intervalMonths: number, dayOfMonth: number): string {
  const every = clampInterval(intervalMonths);
  return `${every === 1 ? "Every month" : `Every ${every} months`} on the ${ordinal(clampDay(dayOfMonth))}`;
}
