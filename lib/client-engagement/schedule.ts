/**
 * CLIENT ENGAGEMENT — the schedule maths.
 *
 * An engagement is a WEEKLY call slot: a weekday, a from/to inside 10:00–20:00,
 * and the date range it repeats over. Everything the calendar and the grids
 * show is derived from those four facts, here, so the calendar, the Emp Grid,
 * the PCA Grid and the server-side validation cannot disagree about a week.
 *
 * Dates are "yyyy-mm-dd" strings and are compared as strings (which sorts
 * correctly); times are "HH:MM" and are converted to minutes past midnight.
 *
 * PURE + CLIENT-SAFE.
 */

import {
  CE_CALL_TYPE_CODES,
  CE_DAY_CODES,
  CE_DAY_END_MIN,
  CE_DAY_START_MIN,
} from "./constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: string | null | undefined): v is string {
  return typeof v === "string" && DATE_RE.test(v);
}

/* ── Times ────────────────────────────────────────────────────────────── */

/** "09:30" or "09:30:00" → 570. Null for anything else. */
export function parseHm(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 570 → "09:30". */
export function toHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 570 → "9:30 AM" — how the calendar labels a block. */
export function toClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 600 → "10h", 90 → "1h 30m", 45 → "45m", 0 → "0m". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ── Dates ────────────────────────────────────────────────────────────── */

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const JS_DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "2026-09-18" → "fri". */
export function dayCodeOf(ymd: string): string {
  return JS_DAY_CODES[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;
}

/** The Monday of the week containing `ymd`. */
export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

/** Monday..Sunday of the week starting `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The date a weekday falls on in the week starting `monday`. */
export function dateInWeek(monday: string, dayCode: string): string {
  const i = CE_DAY_CODES.indexOf(dayCode);
  return addDays(monday, i < 0 ? 0 : i);
}

/* ── Engagements ──────────────────────────────────────────────────────── */

export interface SlotLike {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
}

/** Length of one call, in minutes (0 for an unreadable window). */
export function slotMinutes(s: Pick<SlotLike, "startTime" | "endTime">): number {
  const a = parseHm(s.startTime);
  const b = parseHm(s.endTime);
  return a === null || b === null || b <= a ? 0 : b - a;
}

/** Does this weekly slot happen on `date`? (Right weekday, inside its range.) */
export function runsOn(s: SlotLike, date: string): boolean {
  if (dayCodeOf(date) !== s.dayOfWeek) return false;
  if (date < s.startDate) return false;
  return !(s.endDate && date > s.endDate);
}

/** Does this weekly slot happen in the week starting `monday`? */
export function runsInWeek(s: SlotLike, monday: string): boolean {
  return runsOn(s, dateInWeek(monday, s.dayOfWeek));
}

export interface EngagementInput {
  callType: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
}

/**
 * Everything wrong with an engagement, or null when it is sound. The form and
 * the server action both call this, so the two cannot disagree.
 */
export function validateEngagement(e: EngagementInput): string | null {
  if (!CE_CALL_TYPE_CODES.includes(e.callType)) return "Pick a call type.";
  if (!CE_DAY_CODES.includes(e.dayOfWeek)) return "Pick a day of the week.";
  const start = parseHm(e.startTime);
  const end = parseHm(e.endTime);
  if (start === null || end === null) return "Give the call a From and a To time.";
  if (end <= start) return "The call must end after it starts.";
  if (start < CE_DAY_START_MIN || end > CE_DAY_END_MIN) return "Calls must sit between 10 AM and 8 PM.";
  if (!isYmd(e.startDate)) return "Give it a start date.";
  if (e.endDate !== null && !isYmd(e.endDate)) return "The end date is not a date.";
  if (e.endDate && e.endDate < e.startDate) return "The end date is before the start date.";
  return null;
}

/** Do two date ranges (open-ended when `end` is null) share at least one day? */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndsBeforeB = aEnd !== null && aEnd < bStart;
  const bEndsBeforeA = bEnd !== null && bEnd < aStart;
  return !aEndsBeforeB && !bEndsBeforeA;
}

/**
 * The first existing slot this one would collide with: same weekday, times that
 * overlap (touching end-to-start is fine), and date ranges that share a day.
 */
export function findClash<T extends SlotLike & { id: string }>(
  candidate: SlotLike & { id?: string | null },
  existing: readonly T[],
): T | null {
  const cs = parseHm(candidate.startTime);
  const ce = parseHm(candidate.endTime);
  if (cs === null || ce === null) return null;
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.dayOfWeek !== candidate.dayOfWeek) continue;
    const es = parseHm(e.startTime);
    const ee = parseHm(e.endTime);
    if (es === null || ee === null) continue;
    if (!(cs < ee && es < ce)) continue;
    if (!rangesOverlap(candidate.startDate, candidate.endDate, e.startDate, e.endDate)) continue;
    return e;
  }
  return null;
}

/**
 * The free gaps in one day, given the busy [start, end) windows in minutes —
 * what an admin looks for before handing out new work.
 */
export function freeGaps(
  busy: ReadonlyArray<{ start: number; end: number }>,
  dayStart = CE_DAY_START_MIN,
  dayEnd = CE_DAY_END_MIN,
): Array<{ start: number; end: number }> {
  const sorted = [...busy]
    .map((b) => ({ start: Math.max(dayStart, b.start), end: Math.min(dayEnd, b.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = dayStart;
  for (const b of sorted) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });
  return gaps;
}

/** Total free minutes in a day. */
export function freeMinutes(busy: ReadonlyArray<{ start: number; end: number }>): number {
  return freeGaps(busy).reduce((sum, g) => sum + (g.end - g.start), 0);
}
