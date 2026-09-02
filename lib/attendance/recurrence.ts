import type { RecurrenceMode } from "@/db/enums";

/**
 * REPEATING REQUESTS, expanded to a list of dates (0209).
 *
 * A remote-work request repeats the way a calendar event does — daily, every
 * weekday, weekly, or a custom set of weekdays until a chosen date. What gets
 * STORED is never the rule: it is one ordinary row per date, because
 *
 *   · approval is per-day (a manager must be able to allow Tuesday and refuse
 *     Thursday, which one rule row cannot express);
 *   · the 0205 trigger on `attendance_logs` looks up an approved row FOR THAT
 *     DATE, and teaching it to evaluate recurrence in plpgsql would give us two
 *     implementations to keep in agreement — the second of which decides
 *     whether a punch is legal.
 *
 * PURE — no DB, no clock. The dates a request will occupy are decided by a
 * function you can test, not discovered by reading what it wrote.
 */

/**
 * Hard ceiling on how many days one submission may claim.
 *
 * Not a performance limit — a limit on blast radius. Every generated date is a
 * row somebody has to approve or reject, and "weekly until next December" is
 * fifty of them landing in one queue from one click. Sixty working days is
 * roughly a quarter, which is as far ahead as anyone can honestly commit to
 * being at a client site.
 */
export const MAX_SERIES_DATES = 60;

/** How far ahead `repeatUntil` may reach. Beyond this it is a plan, not a request. */
export const MAX_HORIZON_DAYS = 180;

const DAY_MS = 86_400_000;

function parse(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}
function fmt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()` and the UI's chips. */
export function weekdayOf(iso: string): number {
  return new Date(parse(iso)).getUTCDay();
}

export type RecurrenceUnit = "day" | "week" | "month";

/** How a monthly repeat lands inside each month — Google Calendar's two styles. */
export type MonthlyPattern =
  /** A fixed date: "the 15th". Months without that date (the 31st in February)
   *  are SKIPPED, exactly as a calendar does — never rounded to a nearby day. */
  | { kind: "day"; day: number }
  /** A weekday position: "the first Monday", "the last Friday". `ordinal` is
   *  1–4, or -1 for "last". `weekday` is 0=Sun … 6=Sat, like everywhere else. */
  | { kind: "weekday"; ordinal: 1 | 2 | 3 | 4 | -1; weekday: number };

/** How the series stops. "until" is the original 0209 behavior and the default. */
export type RecurrenceEnd = "until" | "count" | "never";

export interface RecurrenceSpec {
  /** First date of the series. Always included, whatever the pattern says. */
  anchor: string;
  mode: RecurrenceMode;
  /** Last date the series may reach. Required when `end` is "until" (the default). */
  repeatUntil?: string | null;
  /** Weekdays (0–6) for `mode: "custom"` with `unit: "week"`. Ignored otherwise. */
  weekdays?: readonly number[] | null;

  // ── The Google-Calendar extensions (all optional — omitting every one of
  //    them reproduces the original 0209 behavior exactly) ──────────────────
  /** Repeat every N units. 1 (every day / week / month) when omitted. */
  interval?: number | null;
  /** The unit a `custom` repeat counts in. "week" (the 0209 meaning) when omitted. */
  unit?: RecurrenceUnit | null;
  /** Where in the month a `unit: "month"` repeat lands. Required for that unit. */
  monthly?: MonthlyPattern | null;
  /** "until" (needs `repeatUntil`) · "count" (needs `count`) · "never" (runs to
   *  the horizon and stops quietly at the series cap). Default "until". */
  end?: RecurrenceEnd | null;
  /** Number of occurrences for `end: "count"`, the anchor counted as the first. */
  count?: number | null;
}

export type ExpandResult =
  | { ok: true; dates: string[] }
  | { ok: false; error: string };

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * The dates a repeating request covers, ascending, `anchor` first.
 *
 * The ANCHOR IS ALWAYS INCLUDED, even when it does not match the pattern — a
 * custom "Mondays and Wednesdays" starting on a Friday still books that Friday.
 * The alternative is a form that silently drops the date the person actually
 * typed, which reads as the request having failed. Under `end: "count"` the
 * anchor is occurrence number one for the same reason.
 *
 * All arithmetic is UTC (mirroring lib/attendance/leave-cycle), so a series
 * cannot gain or lose a day to a timezone.
 *
 * ── HOW "NEVER" ENDS ───────────────────────────────────────────────────────
 * Nothing here is ever open-ended: every generated date is a row somebody must
 * approve. "Never" therefore means "as far as one submission may reach" — the
 * horizon (MAX_HORIZON_DAYS), stopping QUIETLY at MAX_SERIES_DATES rather than
 * erroring, because the person asked for "no end" and got the most the system
 * allows. An explicit until/count that overruns the caps still errors: there
 * the person named a size, and should hear that it does not fit.
 */
export function expandRecurrence(spec: RecurrenceSpec): ExpandResult {
  const anchor = spec.anchor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return { ok: false, error: "Pick a start date." };
  if (spec.mode === "none") return { ok: true, dates: [anchor] };

  const interval = Math.max(1, Math.floor(spec.interval ?? 1));
  const unit: RecurrenceUnit = spec.unit ?? "week";
  const end: RecurrenceEnd = spec.end ?? "until";
  const start = parse(anchor);

  // ── Where the series is allowed to stop ──────────────────────────────────
  let hardEnd: number;
  let target: number | null = null; // occurrences wanted, for end: "count"
  if (end === "until") {
    const until = spec.repeatUntil;
    if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      return { ok: false, error: "Choose the date this repeat should end on." };
    }
    if (until < anchor) return { ok: false, error: "The repeat must end on or after the start date." };
    hardEnd = parse(until);
    if ((hardEnd - start) / DAY_MS > MAX_HORIZON_DAYS) {
      return {
        ok: false,
        error: `A repeat can reach ${MAX_HORIZON_DAYS} days ahead at most — split it into shorter runs.`,
      };
    }
  } else if (end === "count") {
    const n = spec.count;
    if (!Number.isInteger(n) || (n as number) < 1) {
      return { ok: false, error: "Say how many times this should repeat." };
    }
    if ((n as number) > MAX_SERIES_DATES) {
      return {
        ok: false,
        error: `That repeat covers more than ${MAX_SERIES_DATES} days — shorten it, or split it up.`,
      };
    }
    target = n as number;
    hardEnd = start + MAX_HORIZON_DAYS * DAY_MS;
  } else {
    // "never" — the horizon IS the end.
    hardEnd = start + MAX_HORIZON_DAYS * DAY_MS;
  }

  // ── The pattern each date is tested against ──────────────────────────────
  const anchorWd = weekdayOf(anchor);
  const anchorDate = new Date(start);
  const anchorMonths = anchorDate.getUTCFullYear() * 12 + anchorDate.getUTCMonth();
  // Weeks are Monday-anchored (the chip row starts at M), so "every 2 weeks"
  // means calendar fortnights counted from the anchor's week, not floating
  // 14-day hops from whichever weekday the anchor happens to be.
  const mondayOffset = (anchorWd + 6) % 7;

  const wanted = new Set<number>();
  let monthly: MonthlyPattern | null = null;
  if (spec.mode === "weekdays") [1, 2, 3, 4, 5].forEach((d) => wanted.add(d));
  else if (spec.mode === "custom") {
    if (unit === "week") {
      for (const d of spec.weekdays ?? []) {
        if (Number.isInteger(d) && d >= 0 && d <= 6) wanted.add(d);
      }
      if (wanted.size === 0) return { ok: false, error: "Pick at least one day of the week." };
    } else if (unit === "month") {
      monthly = spec.monthly ?? null;
      if (!monthly) return { ok: false, error: "Choose which day of the month this repeats on." };
      if (monthly.kind === "day" && (monthly.day < 1 || monthly.day > 31)) {
        return { ok: false, error: "A month day is 1 to 31." };
      }
      if (monthly.kind === "weekday" && (monthly.weekday < 0 || monthly.weekday > 6)) {
        return { ok: false, error: "Pick a weekday for the monthly repeat." };
      }
    }
  }

  function matches(ms: number, d: Date): boolean {
    const dayDelta = Math.round((ms - start) / DAY_MS);
    switch (spec.mode) {
      case "daily":
        return dayDelta % interval === 0;
      case "weekdays": {
        const wd = d.getUTCDay();
        return wd >= 1 && wd <= 5;
      }
      case "weekly":
        // Same weekday as the anchor ⇒ dayDelta is a multiple of 7.
        return d.getUTCDay() === anchorWd && (dayDelta / 7) % interval === 0;
      case "custom": {
        if (unit === "day") return dayDelta % interval === 0;
        if (unit === "week") {
          if (!wanted.has(d.getUTCDay())) return false;
          return Math.floor((dayDelta + mondayOffset) / 7) % interval === 0;
        }
        // unit === "month"
        const monthDelta = d.getUTCFullYear() * 12 + d.getUTCMonth() - anchorMonths;
        if (monthDelta % interval !== 0) return false;
        const m = monthly as MonthlyPattern;
        if (m.kind === "day") return d.getUTCDate() === m.day;
        if (d.getUTCDay() !== m.weekday) return false;
        return m.ordinal === -1
          ? d.getUTCDate() + 7 > daysInMonth(d.getUTCFullYear(), d.getUTCMonth())
          : Math.ceil(d.getUTCDate() / 7) === m.ordinal;
      }
      default:
        return false;
    }
  }

  const dates: string[] = [];
  for (let ms = start; ms <= hardEnd; ms += DAY_MS) {
    const d = new Date(ms);
    const iso = fmt(ms);
    // The anchor is unconditional; everything after it must match the pattern.
    if (iso !== anchor && !matches(ms, d)) continue;
    dates.push(iso);
    if (target != null && dates.length >= target) break;
    if (end === "never" && dates.length >= MAX_SERIES_DATES) break; // quiet cap
    if (dates.length > MAX_SERIES_DATES) {
      return {
        ok: false,
        error: `That repeat covers more than ${MAX_SERIES_DATES} days — shorten it, or split it up.`,
      };
    }
  }
  return { ok: true, dates };
}

/** "Mon, Wed, Fri" — for the confirmation line under the repeat picker. */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabels(days: readonly number[]): string {
  return [...days]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
}
