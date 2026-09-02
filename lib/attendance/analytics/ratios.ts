/**
 * Pure attendance ratio helpers — CLIENT-SAFE (no DB, no server-only), so both
 * the server loaders (org.ts) AND client components (drill table) can share them.
 * `MonthSummary` is a type-only import, so this module carries no server code.
 */
import type { MonthSummary } from "@/lib/queries/attendance-status";

/** Days a person actually worked (drives per-day rates). */
export function attendedDays(s: MonthSummary): number {
  return s.present + s.halfDay + s.holidayPresent + s.holidayHalfDay;
}

/** Effective attendance ratio 0..1 (mirrors the existing report `attendanceRate`). */
export function attendanceRatio(s: MonthSummary): number {
  const num = s.present + 0.5 * s.halfDay + s.holidayPresent + s.paidLeave + s.compOff;
  const den = s.present + s.absent + s.halfDay + s.holidayPresent + s.paidLeave + s.unpaidLeave + s.compOff;
  return den > 0 ? num / den : 0;
}

/** On-time ratio 0..1 (1 − unforgiven-late / attended days). */
export function punctualityRatio(s: MonthSummary): number {
  const att = attendedDays(s);
  return att > 0 ? Math.max(0, 1 - s.late / att) : 1;
}
