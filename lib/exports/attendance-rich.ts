import type {
  DashboardRow,
  EmployeeMonthStatus,
} from "@/lib/queries/attendance-status";

/**
 * Attendance report mappers (Task A7). Pure (no DB / no server-only) so the
 * xlsx + pdf routes — and any future test — share one humanized projection of
 * the month dashboard.
 */

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "June 2026" for a 1-12 month. */
export function monthTitle(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1] ?? ""} ${year}`.trim();
}

/** Filename stem like "attendance-2026-06". */
export function attendanceExportFilename(
  year: number,
  month: number,
  ext: "xlsx" | "pdf",
): string {
  const mm = String(month).padStart(2, "0");
  return `attendance-${year}-${mm}.${ext}`;
}

// ── Summary sheet ────────────────────────────────────────────────────────────

export const SUMMARY_HEADERS = [
  "Employee",
  "Present",
  "Absent",
  "Half-Day",
  "Late",
  "Left-Early",
  "Late-Waived",
  "Weekly-Off",
  "Holiday",
  "Holiday-Present",
  "Paid-Leave",
  "Unpaid-Leave",
  "Comp-Off",
  "Payable-Days",
] as const;

/** One dashboard row → the summary AOA row (strings/numbers). */
export function toSummaryRow(r: DashboardRow): (string | number)[] {
  const s = r.summary;
  return [
    r.name,
    s.present,
    s.absent,
    s.halfDay,
    s.late,
    s.leftEarly,
    s.lateWaived,
    s.weeklyOff,
    s.holiday,
    s.holidayPresent,
    s.paidLeave,
    s.unpaidLeave,
    s.compOff,
    s.payableDays,
  ];
}

// ── Matrix sheet (Employee × day-of-month → code) ────────────────────────────

/** Number of days in a 1-12 month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Header row for the matrix sheet: "Employee", "1", "2", … */
export function matrixHeaders(year: number, month: number): string[] {
  const n = daysInMonth(year, month);
  const out: string[] = ["Employee"];
  for (let d = 1; d <= n; d++) out.push(String(d));
  return out;
}

/** The printable per-day cell for one DayRow. "–" (not joined) → "". */
export function dayCell(code: EmployeeMonthStatus["days"][number]["code"]): string {
  return code === "–" ? "" : code;
}

/**
 * One employee's matrix row: their name followed by one cell per calendar day.
 * `detail.days` is the full month walk (one row per day) from
 * getEmployeeMonthStatus, already in day order.
 */
export function toMatrixRow(
  name: string,
  detail: EmployeeMonthStatus,
  year: number,
  month: number,
): string[] {
  const n = daysInMonth(year, month);
  const byDay = new Map<number, string>();
  for (const d of detail.days) {
    const dd = parseInt(d.logDate.slice(8, 10), 10);
    byDay.set(dd, dayCell(d.code));
  }
  const row: string[] = [name];
  for (let d = 1; d <= n; d++) row.push(byDay.get(d) ?? "");
  return row;
}
