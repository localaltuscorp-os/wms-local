/**
 * Shared types + period-key math for the Goals Cascade (Y→Q→M→W).
 *
 * PURE — no DB, no `server-only` — so both server and client may import it.
 * Period keys are anchored to the **financial year (Apr–Mar)** to match the org:
 *   year    → `'2026'`      (FY start year)
 *   quarter → `'2026-Q1'`   (Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar)
 *   month   → `'2026-07'`   (calendar year-month; belongs to the FY it falls in)
 * The Week leaf lives on `weekly_goals.week_start` (Monday date) — see fy-calendar.
 */
import type { GoalRow } from "@/db/schema";
import { istYmd } from "@/lib/weekly-goals/week";

export type GoalPeriod = "year" | "quarter" | "month" | "week" | "day";

/** A cascade goal row (drizzle select shape). numeric(14,2) cols are STRINGs. */
export type Goal = GoalRow;

/** A goal with its cascaded children resolved into a tree. */
export type GoalNode = Goal & { children: GoalNode[] };

/** The two rolled-down target numbers carried through the cascade. `null` when
 *  the parent left the field blank (nothing to divide). */
export interface CascadeTargets {
  targetQty: number | null;
  targetAmount: number | null;
}

/** Calendar month indices (0=Jan) in FINANCIAL-YEAR order: Apr … Mar. */
export const FY_MONTH_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2] as const;

function ymdOf(input: Date | string): string {
  return typeof input === "string" ? input : istYmd(input);
}

/** The financial-year start year for a date. Apr–Dec → that calendar year;
 *  Jan–Mar → the previous calendar year (still the same FY). */
export function fyStartYearOf(input: Date | string): number {
  const ymd = ymdOf(input);
  const year = Number(ymd.slice(0, 4));
  const monthIndex = Number(ymd.slice(5, 7)) - 1; // 0..11
  return monthIndex >= 3 ? year : year - 1;
}

/** FY quarter number (1..4) for a calendar month index (0=Jan). Q1=Apr–Jun. */
export function fyQuarterOfMonthIndex(monthIndex: number): 1 | 2 | 3 | 4 {
  const fyMonth = (monthIndex - 3 + 12) % 12; // 0..11, Apr-first
  return (Math.floor(fyMonth / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Year period key: the FY start year as a string, e.g. '2026'. */
export function yearKey(input: Date | string): string {
  return String(fyStartYearOf(input));
}

/** Quarter period key, e.g. '2026-Q1'. */
export function quarterKey(input: Date | string): string {
  const ymd = ymdOf(input);
  const monthIndex = Number(ymd.slice(5, 7)) - 1;
  return `${fyStartYearOf(ymd)}-Q${fyQuarterOfMonthIndex(monthIndex)}`;
}

/** Month period key = calendar 'YYYY-MM', e.g. '2026-07'. */
export function monthKey(input: Date | string): string {
  return ymdOf(input).slice(0, 7);
}

/** The four quarter keys of an FY, in order Q1..Q4. */
export function quartersOfFy(fyStartYear: number): string[] {
  return [1, 2, 3, 4].map((q) => `${fyStartYear}-Q${q}`);
}

/** The three month keys ('YYYY-MM') owned by a quarter of an FY, in order. */
export function monthKeysOfQuarter(fyStartYear: number, quarter: 1 | 2 | 3 | 4): string[] {
  const slice = FY_MONTH_ORDER.slice((quarter - 1) * 3, quarter * 3);
  return slice.map((monthIndex) => {
    // Apr–Dec sit in the FY start year; Jan–Mar roll into the next calendar year.
    const calYear = monthIndex >= 3 ? fyStartYear : fyStartYear + 1;
    return `${calYear}-${String(monthIndex + 1).padStart(2, "0")}`;
  });
}

/** All twelve month keys of an FY, in FY order (Apr … Mar). */
export function monthKeysOfFy(fyStartYear: number): string[] {
  return ([1, 2, 3, 4] as const).flatMap((q) => monthKeysOfQuarter(fyStartYear, q));
}

/** Parse the FY start year out of a quarter ('2026-Q1') or year ('2026') key. */
export function fyStartYearOfKey(periodKey: string): number {
  return Number(periodKey.slice(0, 4));
}

/** Parse the quarter number (1..4) out of a quarter key ('2026-Q3' → 3). */
export function quarterOfKey(periodKey: string): 1 | 2 | 3 | 4 {
  const m = periodKey.match(/-Q([1-4])$/);
  return (m ? Number(m[1]) : 1) as 1 | 2 | 3 | 4;
}

/**
 * Step a quarter key by `delta` quarters, ROLLING OVER the financial year.
 * '2026-Q4' +1 → '2027-Q1' (Jan–Mar 2027 → Apr–Jun 2027); '2026-Q1' -1 →
 * '2025-Q4'. Negative deltas work too.
 *
 * Counts in absolute quarters (`fy * 4 + q - 1`) rather than branching on the
 * boundary, so a caller can walk any distance in either direction and every FY
 * rollover falls out of the arithmetic — nothing about "which quarter ends the
 * year" is written down twice.
 */
export function shiftQuarterKey(periodKey: string, delta: number): string {
  const absolute = fyStartYearOfKey(periodKey) * 4 + (quarterOfKey(periodKey) - 1) + delta;
  // Floor-divide so negative deltas walk backwards correctly (JS `%` keeps the
  // dividend's sign, which would produce a quarter 0 or a negative index).
  const fy = Math.floor(absolute / 4);
  const q = absolute - fy * 4 + 1;
  return `${fy}-Q${q}`;
}

/**
 * The Quarterly board's ROLLING WINDOW: `anchorKey` plus the next `size - 1`
 * quarters, crossing the financial-year boundary wherever it falls.
 *
 * `quarterWindow('2026-Q2')` → Q2, Q3, Q4 of FY 2026-27 then Q1 of FY 2027-28.
 * Every step goes through `shiftQuarterKey`, so no month, quarter or year is
 * named here and the rollover is never encoded a second time.
 */
export function quarterWindow(anchorKey: string, size = 4): string[] {
  return Array.from({ length: size }, (_, i) => shiftQuarterKey(anchorKey, i));
}

/**
 * Split an ordered list of quarter keys into consecutive runs sharing an FY —
 * the groups the board draws its FY brackets around.
 *
 * Runs are CONSECUTIVE, not bucketed by year: the input is chronological, so a
 * scan preserves that order and a hypothetical repeat of an FY would open a new
 * bracket rather than teleport quarters backwards into an earlier one.
 */
export function groupQuarterKeysByFy(keys: string[]): { fy: number; keys: string[] }[] {
  const groups: { fy: number; keys: string[] }[] = [];
  for (const key of keys) {
    const fy = fyStartYearOfKey(key);
    const last = groups[groups.length - 1];
    if (last && last.fy === fy) last.keys.push(key);
    else groups.push({ fy, keys: [key] });
  }
  return groups;
}

/** The FY start year that owns a month key ('2026-07'). */
export function fyStartYearOfMonthKey(monthKeyStr: string): number {
  const year = Number(monthKeyStr.slice(0, 4));
  const monthIndex = Number(monthKeyStr.slice(5, 7)) - 1;
  return monthIndex >= 3 ? year : year - 1;
}

/** The quarter key ('YYYY-Qn') that owns a month key ('2026-07'). */
export function quarterKeyOfMonthKey(monthKeyStr: string): string {
  const monthIndex = Number(monthKeyStr.slice(5, 7)) - 1;
  return `${fyStartYearOfMonthKey(monthKeyStr)}-Q${fyQuarterOfMonthIndex(monthIndex)}`;
}

/**
 * The three month keys owned by a quarter KEY — '2026-Q3' → Oct/Nov/Dec 2026,
 * '2026-Q4' → Jan/Feb/Mar 2027. The inverse of `quarterKeyOfMonthKey`.
 *
 * The key-taking twin of `monthKeysOfQuarter(fy, q)`: the Monthly nav walks the
 * calendar in quarter KEYS (that is what `shiftQuarterKey`/`quarterWindow`
 * speak), so unpacking one back into its months anywhere else would mean
 * re-deriving the FY and quarter number by hand at every call site.
 */
export function monthsOfQuarterKey(quarterKeyStr: string): string[] {
  return monthKeysOfQuarter(fyStartYearOfKey(quarterKeyStr), quarterOfKey(quarterKeyStr));
}
