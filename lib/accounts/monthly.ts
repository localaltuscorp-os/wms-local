/**
 * Client-SAFE helpers for the Quarter / Month / Annual Checklist (no DB import)
 * — shared by the server page and the client table.
 *
 * Period model: items are tracked per CALENDAR MONTH across a financial year
 * that runs April→March (the Indian FY). We anchor a year by its start year —
 * `fyStartYear = 2025` is "FY 2025-26" (Apr 2025 … Mar 2026). A month's calendar
 * year is the start year for Apr-Dec and start-year+1 for Jan-Mar.
 *
 * Status set + tone are shared with the Weekly Checklist so the two sections
 * read identically.
 */
import {
  MONTH_SHORT,
  MONTH_LABELS,
  WEEKLY_CHECK_STATUSES,
  weeklyStatusTone,
} from "./weekly";

export { MONTH_SHORT, MONTH_LABELS };

/** Closed set of completion states (shared with the Weekly Checklist). */
export const MONTHLY_CHECK_STATUSES = WEEKLY_CHECK_STATUSES;
export type MonthlyCheckStatus = (typeof MONTHLY_CHECK_STATUSES)[number];

/** Status → chip palette (shared with the Weekly Checklist). */
export const monthlyStatusTone = weeklyStatusTone;

/** Cadences an item can have. */
export const MONTHLY_FREQUENCIES = ["Monthly", "Quarterly", "Annual"] as const;

/** Financial-year months in display order: Apr(4) … Mar(3). */
export const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;

/** Calendar year a given FY month belongs to. Apr-Dec → start year; Jan-Mar → +1. */
export function calYearForFyMonth(fyStartYear: number, month: number): number {
  return month >= 4 ? fyStartYear : fyStartYear + 1;
}

/** "FY 2025-26" from the start year. */
export function fyLabel(fyStartYear: number): string {
  const end = (fyStartYear + 1) % 100;
  return `FY ${fyStartYear}-${String(end).padStart(2, "0")}`;
}

/** The FY start-year a given calendar (year, month1) falls in. */
export function fyStartYearFor(year: number, month1: number): number {
  return month1 >= 4 ? year : year - 1;
}

export interface FyMonthCol {
  /** 1..12 calendar month. */
  month: number;
  /** Calendar year this column sits in. */
  calYear: number;
  /** e.g. "Apr". */
  label: string;
  /** e.g. "Apr '25". */
  yearLabel: string;
}

/** The 12 month columns (Apr→Mar) for a financial year. */
export function fyMonthCols(fyStartYear: number): FyMonthCol[] {
  return FY_MONTHS.map((m) => {
    const calYear = calYearForFyMonth(fyStartYear, m);
    return {
      month: m,
      calYear,
      label: MONTH_SHORT[m - 1] ?? "",
      yearLabel: `${MONTH_SHORT[m - 1] ?? ""} '${String(calYear % 100).padStart(2, "0")}`,
    };
  });
}

/**
 * Which months an item is "expected" given its frequency (+ optional anchor).
 * Monthly → every month. Quarterly → the FY quarter-ends (Jun/Sep/Dec/Mar).
 * Annual → its anchor month, or Mar (FY-end) when none is set. Cells outside
 * this set are still tickable — the set only drives the "expected" highlight so
 * empty non-due cells read as intentional rather than missed.
 */
export function expectedMonths(frequency: string | null, dueMonth: number | null): Set<number> {
  const f = (frequency ?? "").trim().toLowerCase();
  if (f === "quarterly") return new Set([6, 9, 12, 3]);
  if (f === "annual" || f === "annually" || f === "yearly") {
    const m = dueMonth && dueMonth >= 1 && dueMonth <= 12 ? dueMonth : 3;
    return new Set([m]);
  }
  // Monthly (or unknown) → every month is expected.
  return new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}

/** Stable map key for a single cell. */
export function monthlyCheckKey(itemId: string, month: number): string {
  return `${itemId}:${month}`;
}
