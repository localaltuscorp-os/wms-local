/**
 * JOB DESCRIPTION — how often a task comes round.
 *
 * PURE, and no `server-only`: the form previews the next few due dates as you
 * pick a frequency, and the push job computes the same dates on the server.
 *
 * ── WHY THIS IS STRUCTURED AND NOT A LABEL ───────────────────────────────────
 * Four of the ten frequencies the business uses cannot be expressed as a set of
 * weekdays at all — "Once in 15 Days", "Once in 30 Days", "Monthly on 2nd
 * Saturday", "First Monday of Month". The DCC schedule model stores a 7-bit
 * weekday mask, so those four have nowhere to live there, and string-matching a
 * label at push time is exactly how the DCC frequency parser ended up needing a
 * `needsReview` escape hatch for everything it could not classify.
 *
 * So the JD owns the richer model and PROJECTS DOWN when pushing (see
 * `toDccSchedule`). Nothing widens dcc_kpi_items, which carries live history
 * behind a gate that blocks punch-out.
 *
 * All dates are calendar days as YYYY-MM-DD strings, in Asia/Kolkata. Nothing
 * here converts through an instant.
 */

import { parseRRule, type ParsedRule } from "@/lib/recurrence/rrule";
import {
  dateFromYmd,
  humanSummary,
  presetOptions,
  type PresetKey,
} from "@/lib/recurrence/google-recurrence";

/** 0 = Monday … 6 = Sunday. Matches the DCC weekday bit order. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Recurrence =
  /** "Does not repeat" — one day, then never again. */
  | { kind: "once"; date: string }
  | { kind: "daily" }
  | { kind: "weekdays"; days: Weekday[] }
  | { kind: "interval"; everyDays: number; anchor: string }
  | { kind: "monthly_ordinal"; ordinal: 1 | 2 | 3 | 4 | -1; weekday: Weekday }
  /** "Annually on [date]" — the same calendar date each year. */
  | { kind: "yearly"; month: number; day: number }
  /**
   * Whatever the Custom dialog built — Google's full grammar as an RRULE,
   * counted from `anchor` (the JD's start date). This is the ONLY shape that
   * can say "every 3 weeks on Tue and Thu, 13 times".
   */
  | { kind: "rrule"; rule: string; anchor: string }
  | { kind: "custom"; label: string };

/**
 * The dropdown, in Google Calendar's vocabulary (account holder, 2026-09-12),
 * now spoken ABOUT THE START DATE the way Google's is (2026-09-16).
 *
 * ── WHY THIS IS A FUNCTION AND NOT A CONSTANT ────────────────────────────────
 * It used to be a fixed list: "Weekly on Saturday", "Monthly on the second
 * Saturday", "Annually on [Date]". That is right one day in seven and quietly
 * wrong the rest of the time — a job starting on a Wednesday offered to repeat
 * "weekly on Saturday", and the literal placeholder "[Date]" was never a date
 * at all. Google names the day you actually picked, so the list is derived.
 *
 * ── THE PATTERNS THAT LEFT THE LIST STILL WORK ───────────────────────────────
 * Mon-Wed-Fri, Tue-Sat, Once in 15 Days, Once in 30 Days and First Monday of
 * Month were offered here once, and rows are stored holding them. They are
 * SHAPES, not list entries — `describeRecurrence`, `isDueOn` and
 * `toDccSchedule` all still handle them, so an existing job description keeps
 * working and keeps reading correctly. What changed is only what a NEW one can
 * be set to from this menu; anything else goes through Custom.
 *
 * ── WHY THE PRESETS ARE NOT RRULEs ───────────────────────────────────────────
 * Each preset maps to the structured shape it always mapped to, NOT to the
 * equivalent RRULE. `FREQ=DAILY` means seven days a week; this firm's "Daily"
 * means Mon–Sat, because a task that fires on the weekly off becomes an overdue
 * row nobody can clear. Only `Custom…` needs the richer grammar, so only
 * `Custom…` produces `{ kind: "rrule" }`.
 */
export function frequencyOptionsFor(
  anchorYmd: string,
): { id: PresetKey; label: string; value: Recurrence }[] {
  const anchor = dateFromYmd(anchorYmd);
  const wd = weekdayOf(anchorYmd) ?? 0;
  const p = parts(anchorYmd);
  return presetOptions(anchor).map(({ key, label }) => ({
    id: key,
    label,
    value: recurrenceForPreset(key, anchorYmd, wd, p),
  }));
}

function recurrenceForPreset(
  key: PresetKey,
  anchorYmd: string,
  wd: Weekday,
  p: { y: number; m: number; d: number } | null,
): Recurrence {
  switch (key) {
    case "none":
      return { kind: "once", date: anchorYmd };
    case "daily":
      return { kind: "daily" };
    case "weekly":
      return { kind: "weekdays", days: [wd] };
    case "monthly":
      return {
        kind: "monthly_ordinal",
        ordinal: monthlyOrdinalOf(anchorYmd),
        weekday: wd,
      };
    case "yearly":
      return { kind: "yearly", month: p?.m ?? 1, day: p?.d ?? 1 };
    case "weekday":
      return { kind: "weekdays", days: [0, 1, 2, 3, 4] };
    case "custom":
      // Seeded empty; the dialog replaces it wholesale on Done.
      return { kind: "rrule", rule: "", anchor: anchorYmd };
  }
}

/**
 * Which ordinal a date is within its month, as the `monthly_ordinal` shape
 * stores it. A date in the final week is always "last" (-1) rather than a
 * fifth, which most months do not have — the same rule the picker speaks.
 */
export function monthlyOrdinalOf(anchorYmd: string): 1 | 2 | 3 | 4 | -1 {
  const p = parts(anchorYmd);
  if (!p) return 1;
  const daysInMonth = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  if (p.d + 7 > daysInMonth) return -1;
  const nth = Math.floor((p.d - 1) / 7) + 1;
  return (nth >= 1 && nth <= 4 ? nth : -1) as 1 | 2 | 3 | 4 | -1;
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** `2026-09-12` → `12/09/2026`, the way the business writes dates. */
function dmy(ymd: string): string {
  const p = parts(ymd);
  if (!p) return ymd;
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}
const ORDINAL_NAMES: Record<string, string> = {
  "1": "First",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "-1": "Last",
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD.exec(ymd.trim());
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

/** Monday-based weekday of a calendar date. */
export function weekdayOf(ymd: string): Weekday | null {
  const p = parts(ymd);
  if (!p) return null;
  const js = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  return ((js + 6) % 7) as Weekday;
}

function daysApart(from: string, to: string): number | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000,
  );
}

/**
 * Which calendar date the n-th given weekday of a month falls on.
 * `ordinal` -1 means the last one in the month.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number, // 1..12
  ordinal: 1 | 2 | 3 | 4 | -1,
  weekday: Weekday,
): string | null {
  if (month < 1 || month > 12) return null;

  if (ordinal === -1) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = last; d >= 1; d--) {
      const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      if (((js + 6) % 7) === weekday) return iso(year, month, d);
    }
    return null;
  }

  let seen = 0;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (((js + 6) % 7) === weekday) {
      seen += 1;
      if (seen === ordinal) return iso(year, month, d);
    }
  }
  // A month can hold only four of a given weekday, so a 5th never resolves.
  return null;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Is this task due on that date?
 *
 * The one question the push job asks, once per JD per day.
 */
export function isDueOn(rec: Recurrence, ymd: string): boolean {
  const p = parts(ymd);
  if (!p) return false;

  switch (rec.kind) {
    case "once":
      // The one day it happens, and never again. No date stored means it can
      // never be due, which is what stops a half-filled form firing daily.
      return rec.date === ymd;
    case "yearly": {
      /* 29 February falls back to the 28th in a common year: a job set for the
         29th must still happen every year, and the alternative — skipping three
         years in four — is never what anybody meant. */
      if (rec.month === 2 && rec.day === 29 && !isLeapYear(p.y)) {
        return p.m === 2 && p.d === 28;
      }
      return p.m === rec.month && p.d === rec.day;
    }
    case "daily": {
      // Mon–Sat. Sunday is the org's default weekly off, and a "daily" task
      // that fires on the rest day produces an overdue row nobody can clear.
      const wd = weekdayOf(ymd);
      return wd !== null && wd !== 6;
    }
    case "weekdays": {
      const wd = weekdayOf(ymd);
      return wd !== null && rec.days.includes(wd);
    }
    case "interval": {
      if (!rec.anchor) return false;
      const gap = daysApart(rec.anchor, ymd);
      if (gap === null || gap < 0) return false;
      // Counted from the anchor, so it drifts across weekdays — which is what
      // "once in 15 days" actually means, as opposed to "every other Friday".
      return rec.everyDays > 0 && gap % rec.everyDays === 0;
    }
    case "monthly_ordinal":
      return nthWeekdayOfMonth(p.y, p.m, rec.ordinal, rec.weekday) === ymd;
    case "rrule":
      return rruleDueOn(rec.rule, rec.anchor, ymd);
    case "custom":
      // Deliberately never auto-due: a custom rule nobody has encoded must not
      // silently fire every day. It shows in the Bank and is pushed by hand.
      return false;
  }
}

/* ── RRULE MATCHING ──────────────────────────────────────────────────────────
 *
 * `lib/recurrence/rrule.ts` GENERATES occurrences forward from an anchor, and
 * caps itself at 200 to stop a runaway rule spawning rows. That cap makes it
 * the wrong tool for the one question asked here — "is this due on this day?" —
 * because a daily job anchored a year back would run out of generated dates and
 * answer "no" for every day after the 200th. So this matches the pattern
 * directly, in closed form, and only walks occurrences where it must (COUNT).
 */

/** rrule.ts's weekday codes, in its own order. */
const RR_WD_ORDER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/** "SU".."SA" → our Monday-based Weekday. */
function toWeekday(code: string): Weekday | null {
  const i = RR_WD_ORDER.indexOf(code as (typeof RR_WD_ORDER)[number]);
  return i < 0 ? null : (((i + 6) % 7) as Weekday);
}

/** Days since the epoch — the cheapest way to compare and step calendar days. */
function dayNum(ymd: string): number | null {
  const p = parts(ymd);
  return p ? Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000) : null;
}

/** Sunday-based day of week for a day number. 1970-01-01 was a Thursday. */
function jsDow(dn: number): number {
  return (((dn + 4) % 7) + 7) % 7;
}

/** The Sunday on or before a day number — rrule.ts's own week boundary. */
function weekStartNum(dn: number): number {
  return dn - jsDow(dn);
}

/** The wanted weekdays of one week, as day numbers, in calendar order. */
function weeklyDayNums(weekStart: number, wanted: Weekday[]): number[] {
  return wanted.map((w) => weekStart + ((w + 1) % 7)).sort((a, b) => a - b);
}

/** Which weekdays a weekly rule lands on — its own list, else the anchor's. */
function weeklyWanted(r: ParsedRule, anchorYmd: string): Weekday[] {
  const listed = r.byDay
    .map(toWeekday)
    .filter((w): w is Weekday => w !== null);
  if (listed.length) return listed;
  const wd = weekdayOf(anchorYmd);
  return wd === null ? [] : [wd];
}

function rruleDueOn(rule: string, anchorYmd: string, ymd: string): boolean {
  const parsed = parseRRule(rule);
  if (!parsed || !anchorYmd) return false;
  // Nothing before the start date, and nothing past an explicit end date.
  if (ymd < anchorYmd) return false;
  if (parsed.until && ymd > parsed.until) return false;
  if (!rruleMatches(parsed, anchorYmd, ymd)) return false;
  // "After N occurrences" — the anchor's own occurrence is #1.
  if (parsed.count !== null && rruleIndex(parsed, anchorYmd, ymd) > parsed.count) return false;
  return true;
}

/** Does the date fit the pattern, ignoring any end condition? */
function rruleMatches(r: ParsedRule, anchorYmd: string, ymd: string): boolean {
  const a = parts(anchorYmd);
  const t = parts(ymd);
  const an = dayNum(anchorYmd);
  const tn = dayNum(ymd);
  if (!a || !t || an === null || tn === null) return false;
  const interval = Math.max(1, r.interval || 1);

  switch (r.freq) {
    case "DAILY":
      return (tn - an) % interval === 0;

    case "WEEKLY": {
      const wanted = weeklyWanted(r, anchorYmd);
      const wd = weekdayOf(ymd);
      if (wd === null || !wanted.includes(wd)) return false;
      // INTERVAL counts WEEKS, so it is measured between week starts — not
      // between the two dates, which would make "every 2 weeks on Mon, Thu"
      // skip the Thursday of every active week.
      const weeks = (weekStartNum(tn) - weekStartNum(an)) / 7;
      return weeks % interval === 0;
    }

    case "MONTHLY": {
      const months = (t.y - a.y) * 12 + (t.m - a.m);
      if (months < 0 || months % interval !== 0) return false;
      if (r.monthlyNth !== null && r.monthlyWeekday) {
        const wd = toWeekday(r.monthlyWeekday);
        if (wd === null) return false;
        const nth = r.monthlyNth;
        if (nth !== -1 && (nth < 1 || nth > 4)) return false;
        return nthWeekdayOfMonth(t.y, t.m, nth as 1 | 2 | 3 | 4 | -1, wd) === ymd;
      }
      // A 31st simply does not happen in a 30-day month, matching the
      // generator — the month is skipped rather than pulled back to the 30th.
      return t.d === (r.byMonthDay ?? a.d);
    }

    case "YEARLY": {
      if ((t.y - a.y) % interval !== 0) return false;
      // 29 February falls back to the 28th in a common year, the same rule the
      // plain `yearly` shape uses — skipping three years in four is never what
      // anybody meant.
      if (a.m === 2 && a.d === 29 && !isLeapYear(t.y)) return t.m === 2 && t.d === 28;
      return t.m === a.m && t.d === a.d;
    }
  }
}

/**
 * Which occurrence this date is, counting the anchor's own as #1.
 *
 * Only consulted when the rule carries COUNT. Closed form everywhere — the
 * weekly case is the fiddly one, because the anchor's week is partial: the
 * occurrences before the start date never happened and must not be counted.
 */
function rruleIndex(r: ParsedRule, anchorYmd: string, ymd: string): number {
  const a = parts(anchorYmd);
  const t = parts(ymd);
  const an = dayNum(anchorYmd);
  const tn = dayNum(ymd);
  if (!a || !t || an === null || tn === null) return Number.MAX_SAFE_INTEGER;
  const interval = Math.max(1, r.interval || 1);

  switch (r.freq) {
    case "DAILY":
      return (tn - an) / interval + 1;

    case "YEARLY":
      return (t.y - a.y) / interval + 1;

    case "MONTHLY": {
      const months = (t.y - a.y) * 12 + (t.m - a.m);
      let index = months / interval + 1;
      // The anchor's own month may resolve to a date BEFORE the start date
      // ("monthly on day 5" started on the 16th) — that one never happened.
      const first = monthlyOccurrenceYmd(r, a);
      if (first !== null && first < anchorYmd) index -= 1;
      return index;
    }

    case "WEEKLY": {
      const wanted = weeklyWanted(r, anchorYmd);
      if (!wanted.length) return Number.MAX_SAFE_INTEGER;
      const anchorWeek = weekStartNum(an);
      const targetWeek = weekStartNum(tn);
      const cycles = (targetWeek - anchorWeek) / 7 / interval;
      const anchorWeekDays = weeklyDayNums(anchorWeek, wanted);
      if (cycles === 0) {
        // Same week as the start date: count only what falls inside it.
        return anchorWeekDays.filter((d) => d >= an && d <= tn).length;
      }
      const startedInAnchorWeek = anchorWeekDays.filter((d) => d >= an).length;
      const rankInTargetWeek = weeklyDayNums(targetWeek, wanted).filter((d) => d <= tn).length;
      return startedInAnchorWeek + (cycles - 1) * wanted.length + rankInTargetWeek;
    }
  }
}

/** The date a MONTHLY rule resolves to inside the anchor's own month. */
function monthlyOccurrenceYmd(
  r: ParsedRule,
  a: { y: number; m: number; d: number },
): string | null {
  if (r.monthlyNth !== null && r.monthlyWeekday) {
    const wd = toWeekday(r.monthlyWeekday);
    if (wd === null) return null;
    const nth = r.monthlyNth;
    if (nth !== -1 && (nth < 1 || nth > 4)) return null;
    return nthWeekdayOfMonth(a.y, a.m, nth as 1 | 2 | 3 | 4 | -1, wd);
  }
  const dom = r.byMonthDay ?? a.d;
  const daysInMonth = new Date(Date.UTC(a.y, a.m, 0)).getUTCDate();
  return dom > daysInMonth ? null : iso(a.y, a.m, dom);
}

/** A human sentence for the Bank list and the form's summary line. */
export function describeRecurrence(rec: Recurrence): string {
  switch (rec.kind) {
    case "once":
      return rec.date ? `Does not repeat — ${dmy(rec.date)}` : "Does not repeat";
    case "yearly":
      return `Annually on ${rec.day} ${MONTH_NAMES[rec.month - 1] ?? ""}`.trim();
    case "daily":
      return "Daily (Mon–Sat)";
    case "weekdays": {
      if (rec.days.length === 0) return "No days selected";
      const names = rec.days.map((d) => WEEKDAY_NAMES[d]?.slice(0, 3) ?? "?");
      return names.length === 1 ? `Every ${WEEKDAY_NAMES[rec.days[0]!]}` : names.join("-");
    }
    case "interval":
      return `Once in ${rec.everyDays} days${rec.anchor ? ` from ${rec.anchor}` : ""}`;
    case "monthly_ordinal":
      return `${ORDINAL_NAMES[String(rec.ordinal)] ?? ""} ${WEEKDAY_NAMES[rec.weekday]} of the month`;
    case "rrule":
      // The dialog's own sentence — "Every 3 weeks on Tue, Thu, 13 times".
      return humanSummary(rec.rule, dateFromYmd(rec.anchor)) ?? "Custom";
    case "custom":
      return rec.label ? `Custom — ${rec.label}` : "Custom";
  }
}

/**
 * Project onto the DCC schedule model for the auto-push.
 *
 * `weekdays` is the 7-bit mask DCC stores (bit 0 = Monday). Anything the mask
 * cannot express becomes `adhoc`, and the JD cron supplies the date instead —
 * which is honest, where forcing it into a weekday pattern would be a lie the
 * gate then enforces daily.
 */
export function toDccSchedule(rec: Recurrence): {
  scheduleKind: "scheduled" | "weekly" | "monthly" | "adhoc";
  weekdays: number | null;
  frequency: string;
} {
  const mask = (days: Weekday[]) => days.reduce<number>((m, d) => m | (1 << d), 0);
  const frequency = describeRecurrence(rec);

  switch (rec.kind) {
    case "daily":
      return { scheduleKind: "scheduled", weekdays: 0b0111111, frequency };
    case "weekdays":
      return {
        // One day a week is a weekly slot; several named days are each due.
        scheduleKind: rec.days.length === 1 ? "weekly" : "scheduled",
        weekdays: mask(rec.days),
        frequency,
      };
    case "monthly_ordinal":
      return { scheduleKind: "monthly", weekdays: 0, frequency };
    case "rrule": {
      /* A plain weekly rule IS a weekday mask, so it projects exactly. Anything
         carrying an INTERVAL or an end condition does not — the mask has no way
         to say "every third week" or "stop after 13" — so it goes to the cron
         as adhoc rather than being flattened into a lie the gate enforces. */
      const parsed = parseRRule(rec.rule);
      if (
        parsed &&
        parsed.freq === "WEEKLY" &&
        Math.max(1, parsed.interval || 1) === 1 &&
        !parsed.until &&
        parsed.count === null
      ) {
        const days = weeklyWanted(parsed, rec.anchor);
        if (days.length) {
          return {
            scheduleKind: days.length === 1 ? "weekly" : "scheduled",
            weekdays: mask(days),
            frequency,
          };
        }
      }
      return { scheduleKind: "adhoc", weekdays: null, frequency };
    }
    case "interval":
    case "once":
    case "yearly":
    case "custom":
      // The DCC model is a 7-bit weekday mask; none of these can be expressed
      // in it, so the JD cron supplies the date instead. Honest, where forcing
      // them into a weekday pattern would be a lie the gate enforces daily.
      return { scheduleKind: "adhoc", weekdays: null, frequency };
  }
}

/** Runtime guard for the jsonb column — a bad row must not crash the Bank. */
export function isRecurrence(v: unknown): v is Recurrence {
  if (typeof v !== "object" || v === null) return false;
  const k = (v as { kind?: unknown }).kind;
  return (
    k === "once" ||
    k === "daily" ||
    k === "weekdays" ||
    k === "interval" ||
    k === "monthly_ordinal" ||
    k === "yearly" ||
    k === "rrule" ||
    k === "custom"
  );
}

/** What an unreadable or missing recurrence falls back to. */
export const DEFAULT_RECURRENCE: Recurrence = { kind: "daily" };

export function readRecurrence(v: unknown): Recurrence {
  return isRecurrence(v) ? v : DEFAULT_RECURRENCE;
}
