/**
 * Client-SAFE helpers for the Weekly Checklist (no DB import) — shared by the
 * server page and the client table.
 *
 * Week-of-month model: the sheet tracks up to five weeks per month (Wk1..Wk5).
 * We map them deterministically by day-of-month — Wk1 = 1–7, Wk2 = 8–14,
 * Wk3 = 15–21, Wk4 = 22–28, Wk5 = 29–end — so the same calendar always yields
 * the same buckets regardless of which weekday the month starts on.
 */

/** Closed set of completion states (matches the source sheet). */
export const WEEKLY_CHECK_STATUSES = ["Done", "Pending", "Need Help", "Not Applicable"] as const;
export type WeeklyCheckStatus = (typeof WEEKLY_CHECK_STATUSES)[number];

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface WeekOfMonth {
  /** 1-based week index (1..5). */
  weekNo: number;
  startDay: number;
  endDay: number;
  /** e.g. "1–7 Aug". */
  label: string;
}

/** Days in a month (month is 1-based here). */
export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/**
 * The week buckets for a (year, month). Always returns the buckets that have at
 * least one real day — a 28-day February yields 4 weeks, a 31-day month yields 5.
 */
export function weeksOfMonth(year: number, month1: number): WeekOfMonth[] {
  const total = daysInMonth(year, month1);
  const short = MONTH_SHORT[month1 - 1] ?? "";
  const out: WeekOfMonth[] = [];
  for (let w = 0; w < 5; w++) {
    const startDay = w * 7 + 1;
    if (startDay > total) break;
    const endDay = Math.min(startDay + 6, total);
    out.push({
      weekNo: w + 1,
      startDay,
      endDay,
      label: `${startDay}–${endDay} ${short}`,
    });
  }
  return out;
}

/** Which week-of-month a given day-of-month falls in (1..5). */
export function weekNoForDay(day: number): number {
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

/** Status → chip palette. Mirrors the Task List tones; N/A is neutral-muted. */
export function weeklyStatusTone(status: string): { bg: string; fg: string; dot: string } {
  const s = status.trim().toLowerCase();
  if (s === "done")
    return {
      bg: "color-mix(in srgb, var(--color-green) 16%, transparent)",
      fg: "var(--color-green-deep)",
      dot: "var(--color-green)",
    };
  if (s === "need help")
    return {
      bg: "color-mix(in srgb, var(--color-altus-red) 13%, transparent)",
      fg: "var(--color-altus-red-deep)",
      dot: "var(--color-altus-red)",
    };
  if (s === "pending")
    return {
      bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 20%, transparent)",
      fg: "var(--color-amber-deep, #b45309)",
      dot: "var(--color-amber, #f59e0b)",
    };
  if (s === "not applicable")
    return {
      bg: "var(--color-surface-track, #eef2f7)",
      fg: "var(--color-ink-subtle)",
      dot: "var(--color-ink-subtle)",
    };
  return { bg: "transparent", fg: "var(--color-ink-subtle)", dot: "var(--color-hairline-strong)" };
}

/** Stable map key for a single cell. */
export function checkKey(itemId: string, weekNo: number): string {
  return `${itemId}:${weekNo}`;
}
