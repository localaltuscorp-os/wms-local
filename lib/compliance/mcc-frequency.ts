/**
 * MCC — HOW OFTEN (account holder, 2026-09-19).
 *
 * PURE and client-safe: the table, the add / edit pop-up, the server actions,
 * the reminders and the Excel import all read these, so a compliance is due on
 * the same days wherever it is looked at.
 *
 * ── THE SEVEN FREQUENCIES, IN THE WORDS THE CHECKLIST USES ───────────────
 *   Monthly          every month, by one deadline day
 *   2 times/month    every month, by two deadline days   (15th & month-end)
 *   3 times/month    every month, by three deadline days (10th, 20th & month-end)
 *   Alternate Month  every 2nd month, by one day
 *   Quarterly        every 3rd month, by one day
 *   Half Yearly      every 6th month, by one day
 *   Annually         once a year, by one day
 * The last four are anchored on a month they are due in — Quarterly from June
 * is due in Jun, Sep, Dec and Mar — and appear on MCC only in those months.
 *
 * ── DEADLINE DAYS ────────────────────────────────────────────────────────
 * 1–31, where 31 means the month's last day: a day past the end of a short
 * month falls on its last day, so a 31st IS month-end in every month.
 *
 * ── WHERE A FILL COUNTS (its period) ─────────────────────────────────────
 *   Monthly                         the calendar month
 *   2 / 3 times a month             the stretch up to each deadline — for the
 *                                   15th & month-end: 1st–15th, 16th–month-end
 *   Alternate / Quarterly / Half /  the whole cycle ending in the due month —
 *   Annually                        Quarterly due in June counts from 1 April,
 *                                   so work done early is not lost
 * A fill made on WCC/MCC is dated its deadline, so a late tick still lands in
 * its own period; the old DCC board and the Android app date a fill the day it
 * was made, and the period decides which deadline that answers.
 *
 * ── CARRIED FORWARD, THEN LAPSED (account holder, 2026-09-19) ────────────
 * Not done by its deadline, a row stays open until the day before the next
 * deadline — the last one of the month until month-end — and then lapses:
 * 1st, 5th, 10th and 15th stay open 1st–4th, 5th–9th, 10th–14th, 15th–end.
 *
 * Stored on dcc_kpi_items (migration 0240): mcc_frequency, mcc_days,
 * mcc_start_month, beside month_day and the `frequency` label.
 */

export const MCC_FREQUENCIES = [
  "monthly",
  "twice_monthly",
  "thrice_monthly",
  "alternate_month",
  "quarterly",
  "half_yearly",
  "annually",
] as const;
export type MccFrequency = (typeof MCC_FREQUENCIES)[number];

/** The words shown in the Frequency column, the pop-up and the Excel template. */
export const MCC_FREQUENCY_LABEL: Record<MccFrequency, string> = {
  monthly: "Monthly",
  twice_monthly: "2 times/month",
  thrice_monthly: "3 times/month",
  alternate_month: "Alternate Month",
  quarterly: "Quarterly",
  half_yearly: "Half Yearly",
  annually: "Annually",
};

/** How many deadlines a due month holds. */
export const DEADLINES_PER_MONTH: Record<MccFrequency, 1 | 2 | 3> = {
  monthly: 1,
  twice_monthly: 2,
  thrice_monthly: 3,
  alternate_month: 1,
  quarterly: 1,
  half_yearly: 1,
  annually: 1,
};

/** Months from one due month to the next. */
export const CYCLE_MONTHS: Record<MccFrequency, 1 | 2 | 3 | 6 | 12> = {
  monthly: 1,
  twice_monthly: 1,
  thrice_monthly: 1,
  alternate_month: 2,
  quarterly: 3,
  half_yearly: 6,
  annually: 12,
};

/** A deadline day meaning "the month's last day". */
export const MONTH_END = 31;

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isMccFrequency(v: unknown): v is MccFrequency {
  return typeof v === "string" && (MCC_FREQUENCIES as readonly string[]).includes(v);
}

/** Does this frequency need the month it is due in? */
export function needsStartMonth(f: MccFrequency): boolean {
  return CYCLE_MONTHS[f] > 1;
}

/** The deadline days a new compliance of this frequency starts with. */
export function defaultDays(f: MccFrequency): number[] {
  if (f === "twice_monthly") return [15, MONTH_END];
  if (f === "thrice_monthly") return [10, 20, MONTH_END];
  return f === "monthly" ? [5] : [MONTH_END];
}

export interface MccSchedule {
  frequency: MccFrequency;
  /** Deadline days, ascending, 1–31 (31 = month-end); as many as the frequency holds. */
  days: number[];
  /** A month it is due in (1–12), for the frequencies that skip months; else null. */
  startMonth: number | null;
}

const validDay = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31;
const validMonth = (m: unknown): m is number => typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;

/**
 * A compliance's schedule from its columns. A compliance from before 0240 —
 * no mcc_frequency — is Monthly, by month_day (NULL = month-end), exactly as it
 * always was.
 */
export function mccScheduleOf(item: {
  monthDay?: number | null;
  mccFrequency?: string | null;
  mccDays?: readonly number[] | null;
  mccStartMonth?: number | null;
}): MccSchedule {
  const frequency = isMccFrequency(item.mccFrequency) ? item.mccFrequency : "monthly";
  const n = DEADLINES_PER_MONTH[frequency];
  let days: number[];
  if (n > 1) {
    const given = (item.mccDays ?? []).filter(validDay);
    days = given.length === n ? [...given].sort((a, b) => a - b) : defaultDays(frequency);
  } else {
    days = [validDay(item.monthDay) ? item.monthDay : MONTH_END];
  }
  // A cycle with no month recorded falls on the financial year's end, March.
  const startMonth = needsStartMonth(frequency) ? (validMonth(item.mccStartMonth) ? item.mccStartMonth : 3) : null;
  return { frequency, days, startMonth };
}

/**
 * What the pop-up or a sheet row asks for, checked and put in order. Deadline
 * days come as 1–31 or null (= month-end).
 */
export function normalizeMccSchedule(input: {
  frequency: string;
  days: readonly (number | null)[];
  startMonth?: number | null;
}): { ok: true; schedule: MccSchedule } | { ok: false; error: string } {
  if (!isMccFrequency(input.frequency)) return { ok: false, error: "Pick a frequency." };
  const f = input.frequency;
  const n = DEADLINES_PER_MONTH[f];
  const days = input.days.map((d) => (d === null ? MONTH_END : d));
  if (days.length !== n) {
    return { ok: false, error: n === 1 ? "Pick the deadline day." : `${MCC_FREQUENCY_LABEL[f]} needs ${n} deadline days.` };
  }
  if (!days.every(validDay)) return { ok: false, error: "A deadline day is 1 to 31, or the last day of the month." };
  for (let i = 1; i < days.length; i++) {
    if (days[i]! <= days[i - 1]!) {
      return { ok: false, error: "The deadline days must be different and in order — e.g. the 15th, then month-end." };
    }
  }
  let startMonth: number | null = null;
  if (needsStartMonth(f)) {
    if (!validMonth(input.startMonth)) return { ok: false, error: `Pick the month ${MCC_FREQUENCY_LABEL[f]} is due in.` };
    startMonth = input.startMonth;
  }
  return { ok: true, schedule: { frequency: f, days, startMonth } };
}

/** The dcc_kpi_items columns a schedule is stored in. */
export function mccColumns(s: MccSchedule): {
  frequency: string;
  monthDay: number | null;
  mccFrequency: MccFrequency;
  mccDays: number[] | null;
  mccStartMonth: number | null;
} {
  const first = s.days[0] ?? MONTH_END;
  return {
    frequency: MCC_FREQUENCY_LABEL[s.frequency],
    // month_day keeps the first deadline, NULL for month-end, as 0238 wrote it.
    monthDay: first >= MONTH_END ? null : first,
    mccFrequency: s.frequency,
    mccDays: DEADLINES_PER_MONTH[s.frequency] > 1 ? [...s.days] : null,
    mccStartMonth: s.startMonth,
  };
}

/* ── Calendar arithmetic (UTC purely as a device; no time zone) ──────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (monthKey: string) => new Date(Date.UTC(+monthKey.slice(0, 4), +monthKey.slice(5, 7), 0)).getUTCDate();
const shiftMonth = (monthKey: string, n: number) => {
  const a = +monthKey.slice(0, 4) * 12 + (+monthKey.slice(5, 7) - 1) + n;
  return `${Math.floor(a / 12)}-${pad((a % 12) + 1)}`;
};

/** The months (1–12) it is due in, starting from its start month. */
export function dueMonths(s: MccSchedule): number[] {
  const cycle = CYCLE_MONTHS[s.frequency];
  if (cycle === 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const start = s.startMonth ?? 3;
  return Array.from({ length: 12 / cycle }, (_, i) => ((start - 1 + i * cycle) % 12) + 1);
}

/** Is it due in this month ('YYYY-MM')? */
export function isDueMonth(s: MccSchedule, monthKey: string): boolean {
  return dueMonths(s).includes(+monthKey.slice(5, 7));
}

export interface MccDeadline {
  deadline: string;
  /** The span a fill counts in, inclusive. */
  periodStart: string;
  periodEnd: string;
  /** The last day it stays open: the day before the next deadline, else month-end. */
  openUntil: string;
}

/** Its deadlines in a month — none in a month it is not due — each with its period. */
export function mccDeadlinesIn(s: MccSchedule, monthKey: string): MccDeadline[] {
  if (!isDueMonth(s, monthKey)) return [];
  const last = daysIn(monthKey);
  const at = (d: number) => `${monthKey}-${pad(d)}`;
  // A 30th and a 31st are the same day in a 30-day month — one deadline, not two.
  const days = [...new Set(s.days.map((d) => Math.min(d, last)))].sort((a, b) => a - b);
  const end = at(last);
  if (days.length === 1) {
    const cycle = CYCLE_MONTHS[s.frequency];
    return [{ deadline: at(days[0]!), periodStart: `${shiftMonth(monthKey, -(cycle - 1))}-01`, periodEnd: end, openUntil: end }];
  }
  return days.map((d, i) => ({
    deadline: at(d),
    periodStart: i === 0 ? at(1) : at(days[i - 1]! + 1),
    periodEnd: i === days.length - 1 ? end : at(d),
    openUntil: i === days.length - 1 ? end : at(days[i + 1]! - 1),
  }));
}

/** The period of one of its deadlines, or null when the date is not one of them. */
export function mccPeriodFor(s: MccSchedule, deadline: string): MccDeadline | null {
  return mccDeadlinesIn(s, deadline.slice(0, 7)).find((d) => d.deadline === deadline) ?? null;
}

/* ── Words ───────────────────────────────────────────────────────────────── */

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** "5th", or "month-end" for 31. */
export function dayText(d: number): string {
  return d >= MONTH_END ? "month-end" : ordinal(d);
}

/**
 * The day of the month a deadline ('YYYY-MM-DD') falls on — "2nd", "15th", and
 * "30th" for September's month-end. MCC's Frequency column shows this alone
 * (account holder, 2026-09-19: "no words, just the month day no.").
 */
export function deadlineDayText(deadline: string): string {
  return ordinal(+deadline.slice(8, 10));
}

function joinAnd(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}` : (parts[0] ?? "");
}

/**
 * When, in words, under the frequency: "by the 5th", "by the 15th & month-end",
 * "by the 15th · Jun, Sep, Dec, Mar", "by 31 Mar".
 */
export function mccDetail(s: MccSchedule): string {
  const by = s.days.length === 1 && s.days[0]! >= MONTH_END ? "by month-end" : `by the ${joinAnd(s.days.map(dayText))}`;
  if (!needsStartMonth(s.frequency)) return by;
  const months = dueMonths(s);
  if (s.frequency === "annually") {
    const m = months[0]! - 1;
    return s.days[0]! >= MONTH_END ? `by the end of ${MONTH_LONG[m]}` : `by ${s.days[0]} ${MONTH_SHORT[m]}`;
  }
  return `${by} · ${months.map((m) => MONTH_SHORT[m - 1]).join(", ")}`;
}
