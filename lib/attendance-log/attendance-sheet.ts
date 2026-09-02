/**
 * Pure mapper for the "Attendance Sheet" tab of the HR "Attendance log"
 * Google Sheet → typed month-summary + per-day rows for the
 * attendance_sheet_month / attendance_sheet_day upserts
 * (lib/attendance-log/attendance-sync.ts).
 *
 * VERIFIED layout (0-based columns; row 0 = legend + weekday labels, row 1 =
 * header, data from row index 2):
 *   [0] FY Year · [1] blank · [2] Month as TEXT "Mon-YYYY" (e.g. "Apr-2022") ·
 *   [3] Employee Name · [4] Designation · [5] Company Name · [6] Present ·
 *   [7] Holiday · [8] Weekly off · [9] Present-on-Holiday-Full · [10] POH-Half ·
 *   [11] Half day · [12] Absent · [13] No of Days In this month ·
 *   [14] Total No Days Worked · [15..45] day 1..31 STATUS CODES
 *   ("P" | "A" | "W/O" | "H" | "H-P" | "H-H/D" | "H/D" | "-") · [46] Remark.
 *
 * The month cell is parsed by MONTH NAME via monthBucketFromCell
 * (lib/salary/breakup-sheet.ts) — NEVER new Date(), which parses at local
 * midnight and, read back as UTC, silently drifts the month back one.
 *
 * Dependency-free + TOTAL: a malformed row is skipped and counted, never
 * thrown — one bad sheet row must never abort (or corrupt) a sync run.
 * Trailing empty cells are NOT padded by the Sheets API — indexed defensively.
 */
import { monthBucketFromCell } from "@/lib/salary/breakup-sheet";

/** Data begins here ("Attendance Sheet" has 2 header rows). */
export const ATTENDANCE_SHEET_DATA_START_ROW = 2;

/** Day-code columns: [15] = day 1 … [45] = day 31. */
const DAY_COL_START = 15;
const DAY_COUNT = 31;
const REMARK_COL = 46;

/** One parsed summary row, 1:1 with attendance_sheet_month. */
export interface AttendanceMonthRow {
  fy: string | null;
  /** Month bucket, always 'YYYY-MM-01'. */
  month: string;
  employeeName: string;
  designation: string | null;
  companyName: string | null;
  present: number;
  holiday: number;
  weeklyOff: number;
  pohFull: number;
  pohHalf: number;
  halfDay: number;
  absent: number;
  daysInMonth: number;
  totalDaysWorked: number;
  remark: string | null;
}

/** One parsed day cell, 1:1 with attendance_sheet_day. */
export interface AttendanceDayRow {
  employeeName: string;
  /** Month bucket, 'YYYY-MM-01' (same as its parent month row). */
  month: string;
  /** Day-of-month 1..31 as laid out in the sheet. */
  day: number;
  /** Raw sheet code, verbatim (trimmed). */
  statusCode: string;
  /** Derived 'YYYY-MM-DD'; null when day > real length of that month. */
  date: string | null;
}

export interface AttendanceSheetMapResult {
  months: AttendanceMonthRow[];
  days: AttendanceDayRow[];
  /** Non-blank rows in range missing a name (col 3) or parseable month (col 2). */
  skipped: number;
  /** Later duplicates of an already-seen (employee_name, month) key (last wins). */
  duplicates: number;
}

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/[,\s]/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const num0 = (v: unknown): number => numOrNull(v) ?? 0;
const txt = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

/** Real calendar length of a 'YYYY-MM-01' bucket — pure UTC arithmetic. */
export function calendarDaysInMonth(monthBucket: string): number {
  const y = Number(monthBucket.slice(0, 4));
  const mo = Number(monthBucket.slice(5, 7));
  // Day 0 of the NEXT month = last day of this month (UTC, no tz drift).
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/**
 * Map the raw Sheets matrix (readSheetValuesReadonly output) to typed rows.
 * Keep-rule: a row counts only if it has an Employee Name (col 3) AND a
 * parseable month (col 2). Fully-blank rows are skipped silently; rows missing
 * name-or-month are COUNTED as skipped. Duplicate (name, month) keys keep the
 * LAST occurrence (and are counted) so the batched upsert never hits the same
 * unique key twice in one statement.
 */
export function mapAttendanceSheetRows(matrix: string[][]): AttendanceSheetMapResult {
  const byKey = new Map<string, { month: AttendanceMonthRow; days: AttendanceDayRow[] }>();
  let skipped = 0;
  let duplicates = 0;

  for (let i = ATTENDANCE_SHEET_DATA_START_ROW; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue; // blank line — not "skipped"

    const employeeName = txt(r[3]);
    const month = monthBucketFromCell(r[2]);
    if (!employeeName || !month) {
      skipped++;
      continue;
    }

    const monthRow: AttendanceMonthRow = {
      fy: txt(r[0]),
      month,
      employeeName,
      designation: txt(r[4]),
      companyName: txt(r[5]),
      present: num0(r[6]),
      holiday: num0(r[7]),
      weeklyOff: num0(r[8]),
      pohFull: num0(r[9]),
      pohHalf: num0(r[10]),
      halfDay: num0(r[11]),
      absent: num0(r[12]),
      daysInMonth: num0(r[13]),
      totalDaysWorked: num0(r[14]),
      remark: txt(r[REMARK_COL]),
    };

    const realDays = calendarDaysInMonth(month);
    const days: AttendanceDayRow[] = [];
    for (let d = 1; d <= DAY_COUNT; d++) {
      // Trailing empty cells are not padded — index defensively.
      const raw = String(r[DAY_COL_START + d - 1] ?? "").trim();
      if (raw === "") continue; // genuinely empty cell → no day record
      days.push({
        employeeName,
        month,
        day: d,
        statusCode: raw,
        date: d <= realDays ? `${month.slice(0, 8)}${String(d).padStart(2, "0")}` : null,
      });
    }

    const key = `${employeeName.toLowerCase()}|${month}`;
    if (byKey.has(key)) duplicates++;
    byKey.set(key, { month: monthRow, days }); // last occurrence wins
  }

  const months: AttendanceMonthRow[] = [];
  const days: AttendanceDayRow[] = [];
  for (const entry of byKey.values()) {
    months.push(entry.month);
    days.push(...entry.days);
  }
  return { months, days, skipped, duplicates };
}
