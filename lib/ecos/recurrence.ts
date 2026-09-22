/**
 * BROADCAST REPEATS — when a recurring broadcast goes out next.
 *
 * Daily / Weekly step by a fixed period. Monthly / Annually land on the same
 * day of the month as the FIRST send (the anchor), clamped to shorter months:
 * a broadcast first sent on 31 Jan goes out 28 Feb, then 31 Mar again — it
 * does not drift to the 28th for ever. Custom repeats walk an explicit list of
 * dates.
 *
 * Calendar maths runs on the India wall clock (IST, no daylight saving): a
 * broadcast scheduled for 00:30 on the 31st in Mumbai is the 30th in UTC, and
 * clamping that UTC day would move it.
 *
 * Every step lands strictly after `now`, so a broadcast whose schedule fell
 * behind (the sweep did not run for a while) sends ONE copy and re-arms for the
 * future, rather than a burst of catch-up copies.
 *
 * PURE: no I/O.
 */

import type { BroadcastRecurrence } from "@/db/enums";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** The most custom dates one broadcast may carry. */
export const MAX_CUSTOM_DATES = 50;

const toIst = (d: Date): Date => new Date(d.getTime() + IST_OFFSET_MS);
const fromIst = (d: Date): Date => new Date(d.getTime() - IST_OFFSET_MS);

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** `prev` moved by `months`, on `anchorDay` clamped to that month, same IST time of day. */
function addMonthsAnchored(prev: Date, months: number, anchorDay: number): Date {
  const p = toIst(prev);
  const total = p.getUTCMonth() + months;
  const year = p.getUTCFullYear() + Math.floor(total / 12);
  const month0 = ((total % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(year, month0));
  return fromIst(
    new Date(Date.UTC(year, month0, day, p.getUTCHours(), p.getUTCMinutes(), p.getUTCSeconds(), p.getUTCMilliseconds())),
  );
}

/** One period after `prev`. */
export function stepOnce(
  prev: Date,
  recurrence: "daily" | "weekly" | "monthly" | "annually",
  anchor?: Date | null,
): Date {
  if (recurrence === "daily") return new Date(prev.getTime() + DAY_MS);
  if (recurrence === "weekly") return new Date(prev.getTime() + 7 * DAY_MS);
  const anchorDay = toIst(anchor ?? prev).getUTCDate();
  return addMonthsAnchored(prev, recurrence === "monthly" ? 1 : 12, anchorDay);
}

/**
 * Custom dates cleaned for storage: valid instants only, de-duplicated, sorted,
 * capped at MAX_CUSTOM_DATES. Returned as ISO strings.
 */
export function normaliseCustomDates(list: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const times = new Set<number>();
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const t = Date.parse(raw);
    if (Number.isFinite(t)) times.add(t);
  }
  return [...times]
    .sort((a, b) => a - b)
    .slice(0, MAX_CUSTOM_DATES)
    .map((t) => new Date(t).toISOString());
}

/** The earliest custom date after `now`, or null. */
export function firstUpcomingCustomDate(list: readonly unknown[] | null | undefined, now: Date): Date | null {
  for (const iso of normaliseCustomDates(list)) {
    const t = Date.parse(iso);
    if (t > now.getTime()) return new Date(t);
  }
  return null;
}

/**
 * When a broadcast that last went out at `prev` goes out next — strictly after
 * both `prev` and `now` — or null when it does not repeat any more (one-time,
 * or a custom list with no dates left).
 */
export function nextOccurrence(
  prev: Date,
  recurrence: BroadcastRecurrence,
  now: Date,
  opts: { anchor?: Date | null; customDates?: readonly unknown[] | null } = {},
): Date | null {
  if (recurrence === "none") return null;

  if (recurrence === "custom") {
    const after = Math.max(prev.getTime(), now.getTime());
    return firstUpcomingCustomDate(opts.customDates, new Date(after));
  }

  if (recurrence === "daily" || recurrence === "weekly") {
    const period = recurrence === "daily" ? DAY_MS : 7 * DAY_MS;
    const behind = now.getTime() - prev.getTime();
    const steps = behind < 0 ? 1 : Math.floor(behind / period) + 1;
    return new Date(prev.getTime() + steps * period);
  }

  let next = stepOnce(prev, recurrence, opts.anchor);
  for (let i = 0; i < 1200 && next.getTime() <= now.getTime(); i++) {
    next = stepOnce(next, recurrence, opts.anchor);
  }
  return next;
}
