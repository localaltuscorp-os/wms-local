/**
 * Phase 5.2 — RRULE-lite parser + occurrence generator.
 *
 * Supports the subset the in-app ScheduleSection picker emits:
 *   FREQ=DAILY                          → every day
 *   FREQ=WEEKLY[;BYDAY=MO,WE,FR]        → weekly, optional specific weekdays
 *   FREQ=MONTHLY[;BYDAY=2MO]            → monthly on the nth weekday
 *   FREQ=MONTHLY[;BYMONTHDAY=15]        → monthly on day-of-month
 *   FREQ=YEARLY                         → same month + day each year
 *   ...;UNTIL=2026-12-31                → end on (inclusive) the given date
 *
 * Outside the canonical RRULE spec only insofar as UNTIL is yyyy-mm-dd
 * rather than yyyymmddThhmmssZ — the ScheduleSection emits it that way.
 *
 * No DST/timezone arithmetic: occurrences are calendar dates (no
 * times), which the materializer pairs with the anchor task's
 * `dueAt` time-of-day. That sidesteps the entire DST mess for
 * a feature that's only really about "what day does this happen".
 *
 * Pure module — no I/O, no DB. Caller passes the anchor (the
 * original task's date) + a window and gets back yyyy-mm-dd strings.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export interface ParsedRule {
  freq: Freq;
  interval: number;           // every N periods (default 1)
  byDay: Weekday[];           // for WEEKLY
  monthlyNth: number | null;  // for MONTHLY (1..5 or -1 = "last"), set when BYDAY="2MO" etc.
  monthlyWeekday: Weekday | null;
  byMonthDay: number | null;  // for MONTHLY (1..31)
  until: string | null;       // yyyy-mm-dd, inclusive
  count: number | null;       // total occurrences incl. the anchor (Google "After N")
}

const WD_ORDER: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Strip the time-portion so we work in pure calendar dates. */
function midnightUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Parse an RRULE-lite string. Returns null on shapes we don't recognise. */
export function parseRRule(rule: string): ParsedRule | null {
  if (!rule || typeof rule !== "string") return null;
  const out: ParsedRule = {
    freq: "DAILY",
    interval: 1,
    byDay: [],
    monthlyNth: null,
    monthlyWeekday: null,
    byMonthDay: null,
    until: null,
    count: null,
  };
  let sawFreq = false;
  for (const seg of rule.split(";")) {
    const [rawKey, rawVal] = seg.split("=");
    if (!rawKey || rawVal === undefined) continue;
    const key = rawKey.trim().toUpperCase();
    const val = rawVal.trim();
    switch (key) {
      case "FREQ": {
        const v = val.toUpperCase();
        if (v === "DAILY" || v === "WEEKLY" || v === "MONTHLY" || v === "YEARLY") {
          out.freq = v;
          sawFreq = true;
        } else {
          return null;
        }
        break;
      }
      case "BYDAY": {
        // Either weekly list ("MO,WE,FR") or monthly nth-weekday ("2MO" / "-1FR").
        const tokens = val.split(",").filter(Boolean);
        if (tokens.length === 1 && /^-?\d+[A-Z]{2}$/i.test(tokens[0]!)) {
          const m = tokens[0]!.match(/^(-?\d+)([A-Z]{2})$/i)!;
          out.monthlyNth = Number(m[1]);
          out.monthlyWeekday = m[2]!.toUpperCase() as Weekday;
        } else {
          for (const t of tokens) {
            const up = t.toUpperCase();
            if (WD_ORDER.includes(up as Weekday)) out.byDay.push(up as Weekday);
          }
        }
        break;
      }
      case "BYMONTHDAY": {
        const n = Number(val);
        if (Number.isInteger(n) && n >= 1 && n <= 31) out.byMonthDay = n;
        break;
      }
      case "UNTIL": {
        // Accept yyyy-mm-dd OR yyyymmdd OR yyyymmddTHHmmssZ.
        const m = val.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
        if (m) out.until = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
      case "INTERVAL": {
        const n = Number(val);
        if (Number.isInteger(n) && n >= 1) out.interval = n;
        break;
      }
      case "COUNT": {
        const n = Number(val);
        if (Number.isInteger(n) && n >= 1) out.count = n;
        break;
      }
      // BYSETPOS not supported in the picker; ignore.
    }
  }
  return sawFreq ? out : null;
}

/**
 * Iterate the calendar dates an `anchor`'s rule occurs on, strictly
 * AFTER `anchor`, up to and including `windowEnd` (and capped by
 * `until` if the rule has one). Returns an array of yyyy-mm-dd
 * strings in ascending order.
 *
 * `anchor` is the original (rule-holder) task's calendar day —
 * always treated as a calendar date (no time-of-day arithmetic).
 *
 * Hard caps generation to MAX_OCCURRENCES to keep a runaway rule from
 * spawning thousands of rows on a single cron tick.
 */
const MAX_OCCURRENCES = 200;

export function generateOccurrences(
  rule: ParsedRule,
  anchor: Date,
  windowEnd: Date,
): string[] {
  const start = midnightUTC(anchor);
  const end = midnightUTC(windowEnd);
  const untilCap = rule.until ? new Date(`${rule.until}T23:59:59Z`) : null;
  const out: string[] = [];

  if (start.getTime() > end.getTime()) return out;

  const interval = Math.max(1, rule.interval || 1);
  // The anchor is occurrence #1, so we only ever emit up to (count - 1) more.
  const limit =
    rule.count !== null
      ? Math.min(MAX_OCCURRENCES, Math.max(0, rule.count - 1))
      : MAX_OCCURRENCES;
  if (limit === 0) return out;

  // Cursor walks one period at a time, stepping by `interval`, bounded by `end`.
  if (rule.freq === "DAILY") {
    let cur = addDays(start, interval);
    while (cur.getTime() <= end.getTime() && out.length < limit) {
      if (untilCap && cur.getTime() > untilCap.getTime()) break;
      out.push(ymd(cur));
      cur = addDays(cur, interval);
    }
    return out;
  }

  if (rule.freq === "WEEKLY") {
    // If BYDAY is empty, fall back to "same weekday as anchor".
    const wantedDays = rule.byDay.length
      ? new Set(rule.byDay)
      : new Set<Weekday>([WD_ORDER[start.getUTCDay()]!]);
    const anchorWeek = weekStartUTC(start);
    let cur = nextDay(start);
    while (cur.getTime() <= end.getTime() && out.length < limit) {
      if (untilCap && cur.getTime() > untilCap.getTime()) break;
      const wd = WD_ORDER[cur.getUTCDay()]!;
      if (wantedDays.has(wd)) {
        // Honour INTERVAL: only weeks a multiple of `interval` from the anchor.
        const weeks = Math.round(
          (weekStartUTC(cur).getTime() - anchorWeek.getTime()) / WEEK_MS,
        );
        if (weeks % interval === 0) out.push(ymd(cur));
      }
      cur = nextDay(cur);
    }
    return out;
  }

  if (rule.freq === "MONTHLY") {
    // Step through months starting from the anchor's month. Emit the
    // matching date for each month iff it's STRICTLY after the anchor
    // and within the window — the anchor itself counts as occurrence #1
    // and shouldn't be duplicated, but later dates in the same month
    // (e.g. "last Friday" of an early-month anchor) absolutely qualify.
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let safety = 0; safety < 24 * 12 && out.length < limit; safety++) {
      // Honour INTERVAL: only months a multiple of `interval` from the anchor.
      const monthsFromAnchor =
        (y - start.getUTCFullYear()) * 12 + (m - start.getUTCMonth());
      if (monthsFromAnchor % interval === 0) {
        const occ = monthlyOccurrence(y, m, rule, start);
        if (occ) {
          if (occ.getTime() > end.getTime()) break;
          if (occ.getTime() > start.getTime()) {
            if (untilCap && occ.getTime() > untilCap.getTime()) break;
            out.push(ymd(occ));
          }
        }
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }

  if (rule.freq === "YEARLY") {
    // Same month + day every `interval` years, starting after the anchor.
    const anchorYear = start.getUTCFullYear();
    let y = anchorYear + 1;
    for (let safety = 0; safety < 200 && out.length < limit; safety++, y++) {
      if ((y - anchorYear) % interval !== 0) continue;
      const occ = new Date(Date.UTC(y, start.getUTCMonth(), start.getUTCDate()));
      if (occ.getTime() > end.getTime()) break;
      if (untilCap && occ.getTime() > untilCap.getTime()) break;
      out.push(ymd(occ));
    }
    return out;
  }

  return out;
}

function nextDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** Sunday (UTC) on or before `d` — the start of d's week. */
function weekStartUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()),
  );
}

/**
 * Resolve the rule's monthly occurrence for a given year+month. Returns
 * null when the rule can't be honoured for that month (e.g. BYMONTHDAY=31
 * in February, or BYDAY=5MO in a month without 5 Mondays).
 */
function monthlyOccurrence(
  year: number,
  month: number, // 0..11
  rule: ParsedRule,
  anchor: Date,
): Date | null {
  // Nth weekday (BYDAY=2MO etc.)
  if (rule.monthlyNth !== null && rule.monthlyWeekday) {
    const targetWd = WD_ORDER.indexOf(rule.monthlyWeekday);
    if (rule.monthlyNth === -1) {
      // Last <weekday> of month — walk back from the last day.
      const last = new Date(Date.UTC(year, month + 1, 0));
      const diff = (last.getUTCDay() - targetWd + 7) % 7;
      return new Date(Date.UTC(year, month, last.getUTCDate() - diff));
    }
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (targetWd - first.getUTCDay() + 7) % 7;
    const day = 1 + offset + (rule.monthlyNth - 1) * 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (day > daysInMonth) return null; // not enough Nth-weekdays this month
    return new Date(Date.UTC(year, month, day));
  }

  // Day-of-month (BYMONTHDAY=15)
  if (rule.byMonthDay !== null) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (rule.byMonthDay > daysInMonth) return null;
    return new Date(Date.UTC(year, month, rule.byMonthDay));
  }

  // No anchoring info — fall back to "same day-of-month as anchor".
  const anchorDay = anchor.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (anchorDay > daysInMonth) return null;
  return new Date(Date.UTC(year, month, anchorDay));
}
