/**
 * INCENTIVE TARGET — period model.
 *
 * Pure and client-safe (no DB, no I/O). One period vocabulary for the whole
 * target system: week / month / quarter / year. A period is identified by a
 * canonical string value and resolves to a [start, end) date window, where
 * `end` is the first day after the period (exclusive), matching every other
 * date-window reader in the module.
 *
 * Value formats:
 *   week    "YYYY-MM-DD" — the Monday that starts the week
 *   month   "YYYY-MM"
 *   quarter "YYYY-QN"    — N in 1..4
 *   year    "YYYY"
 *
 * Weeks run Monday→Sunday, matching lib/weekly-goals/week.ts (the team's
 * clock). Month/quarter/year math is string arithmetic on "YYYY-MM" keys, so
 * there is no timezone drift.
 */

import { addDays, mondayOf, formatWeekLabel, istYmd } from "@/lib/weekly-goals/week";

export type TargetPeriodType = "week" | "month" | "quarter" | "year";

export const TARGET_PERIOD_TYPES: readonly TargetPeriodType[] = [
  "week",
  "month",
  "quarter",
  "year",
] as const;

export const TARGET_PERIOD_LABELS: Record<TargetPeriodType, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface TargetPeriod {
  type: TargetPeriodType;
  value: string;
}

export interface PeriodBounds {
  type: TargetPeriodType;
  value: string;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, exclusive (first day after the period). */
  end: string;
  /** Human label: "22-Sep-2026 – 28-Sep-2026", "Oct 2026", "Q4 2026", "2027". */
  label: string;
}

export function isTargetPeriodType(v: unknown): v is TargetPeriodType {
  return typeof v === "string" && (TARGET_PERIOD_TYPES as readonly string[]).includes(v);
}

/** Add `n` months to a "YYYY-MM" key. */
export function addMonthsKey(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Resolve a (type, value) pair to concrete bounds, or null when invalid. */
export function periodBounds(type: TargetPeriodType, value: string): PeriodBounds | null {
  switch (type) {
    case "week": {
      // Accept any date; snap it to the Monday that opens its week, so a user
      // who picks a mid-week day still lands on the week they meant.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return null;
      const start = mondayOf(value);
      return { type, value: start, start, end: addDays(start, 7), label: formatWeekLabel(start) };
    }
    case "month": {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
      const start = `${value}-01`;
      const end = `${addMonthsKey(value, 1)}-01`;
      const [y, m] = value.split("-").map(Number) as [number, number];
      return { type, value, start, end, label: `${MONTHS[m - 1]} ${y}` };
    }
    case "quarter": {
      const m = value.match(/^(\d{4})-Q([1-4])$/);
      if (!m) return null;
      const year = Number(m[1]);
      const q = Number(m[2]);
      const qMonth = (q - 1) * 3 + 1;
      const startKey = `${year}-${pad2(qMonth)}`;
      return {
        type,
        value,
        start: `${startKey}-01`,
        end: `${addMonthsKey(startKey, 3)}-01`,
        label: `Q${q} ${year}`,
      };
    }
    case "year": {
      if (!/^\d{4}$/.test(value)) return null;
      const y = Number(value);
      return { type, value, start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y) };
    }
  }
}

/** Validate and normalise a period; null when it does not parse. */
export function parsePeriod(type: TargetPeriodType, value: string): PeriodBounds | null {
  return periodBounds(type, value);
}

/** The current period value for a type, in IST. */
export function currentPeriodValue(type: TargetPeriodType, now: Date = new Date()): string {
  const today = istYmd(now);
  if (type === "week") return mondayOf(today);
  if (type === "month") return today.slice(0, 7);
  if (type === "year") return today.slice(0, 4);
  const m = Number(today.slice(5, 7));
  return `${today.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
}

// ── Option builders (for the form and the dashboard filter) ────────────────

export interface PeriodOption {
  value: string;
  label: string;
}

/** Week options: `past` weeks back through `future` weeks ahead, oldest first. */
export function weekOptions(now: Date = new Date(), past = 6, future = 12): PeriodOption[] {
  const current = mondayOf(now);
  const out: PeriodOption[] = [];
  for (let i = past; i >= -future; i--) {
    const start = addDays(current, -7 * i);
    out.push({ value: start, label: formatWeekLabel(start) });
  }
  return out;
}

/** Month options: `past` months back through `future` months ahead, oldest first. */
export function monthOptions(now: Date = new Date(), past = 6, future = 12): PeriodOption[] {
  const cur = istYmd(now).slice(0, 7);
  const out: PeriodOption[] = [];
  for (let i = past; i >= -future; i--) {
    const key = addMonthsKey(cur, -i);
    const [y, m] = key.split("-").map(Number) as [number, number];
    out.push({ value: key, label: `${MONTHS[m - 1]} ${y}` });
  }
  return out;
}

/** Quarter options: `past` quarters back through `future` ahead, oldest first. */
export function quarterOptions(now: Date = new Date(), past = 4, future = 8): PeriodOption[] {
  const today = istYmd(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const curQ = Math.floor((month - 1) / 3) + 1;
  // Absolute quarter index (year*4 + q), 0-based.
  const curIndex = year * 4 + (curQ - 1);
  const out: PeriodOption[] = [];
  for (let i = past; i >= -future; i--) {
    const idx = curIndex - i;
    const y = Math.floor(idx / 4);
    const q = (idx - y * 4) + 1;
    out.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}` });
  }
  return out;
}

/** Year options: `past` years back through `future` ahead, oldest first. */
export function yearOptions(now: Date = new Date(), past = 3, future = 5): PeriodOption[] {
  const cur = Number(istYmd(now).slice(0, 4));
  const out: PeriodOption[] = [];
  for (let i = past; i >= -future; i--) {
    const y = cur - i;
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

/** The quick presets the dashboard filter offers. */
export interface PeriodPreset {
  id: string;
  type: TargetPeriodType;
  value: string;
  label: string;
}

export function periodPresets(now: Date = new Date()): PeriodPreset[] {
  const today = istYmd(now);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  const thisQ = `${thisYear}-Q${Math.floor((month - 1) / 3) + 1}`;
  const lastWeek = addDays(mondayOf(today), -7);
  const lastMonth = addMonthsKey(thisMonth, -1);
  const nextMonth = addMonthsKey(thisMonth, 1);
  const nextQuarterYear = Number(thisYear) + (Math.floor((month - 1) / 3) + 1 === 4 ? 1 : 0);
  const nextQuarterIdx = ((Math.floor((month - 1) / 3) + 1) % 4) + 1;
  const nextQuarter = `${nextQuarterYear}-Q${nextQuarterIdx}`;
  const nextYear = String(Number(thisYear) + 1);

  const lb = periodBounds("week", lastWeek);
  const lm = periodBounds("month", lastMonth);
  return [
    { id: "past_week", type: "week", value: lastWeek, label: `Past Week · ${lb?.label ?? ""}` },
    { id: "past_month", type: "month", value: lastMonth, label: `Past Month · ${lm?.label ?? ""}` },
    { id: "this_month", type: "month", value: thisMonth, label: "This Month" },
    { id: "this_quarter", type: "quarter", value: thisQ, label: "This Quarter" },
    { id: "next_month", type: "month", value: nextMonth, label: "Next Month" },
    { id: "next_quarter", type: "quarter", value: nextQuarter, label: "Next Quarter" },
    { id: "next_year", type: "year", value: nextYear, label: "Next Year" },
  ];
}
