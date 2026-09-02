/**
 * Pure mapper from the "Altus Log" → Summary sheet (raw array-of-arrays via
 * `XLSX.utils.sheet_to_json(ws, { header: 1 })`) to typed per-employee-per-month
 * records, plus a payable-days helper used by the Phase-C salary backtest.
 *
 * Dependency-free + total: no throws on bad rows — they are simply skipped.
 *
 * Column layout is mapped by FIXED INDEX (the header row is unreliable/shifted):
 *   [0] serial (ignore)  [1] FY label  [2] month-end date (Date | string)
 *   [3] Employee Name (blank → skip)  [4] Designation  [5] Company Name
 *   [6] Present  [7] Holiday  [8] Weekly off  [9] Present-on-Holiday (Full)
 *   [10] Present-on-Holiday (Half)  [11] Half day  [12] Absent
 *   [13] No of Days In this month  [14] Total No Days Worked
 */

export interface AltusLogMonthRow {
  fy: string; // "FY 22-23"
  month: string; // "2022-03" (YYYY-MM, from the col-2 month-end date)
  employeeName: string;
  designation: string | null;
  entity: string | null; // Company Name
  present: number;
  holiday: number;
  weeklyOff: number;
  holidayPresentFull: number;
  holidayPresentHalf: number;
  halfDay: number;
  absent: number;
  daysInMonth: number;
  totalWorked: number;
}

/**
 * Σ day-values from the summary counts — MUST match lib/attendance/status.ts
 * day-values: P=1, W/O=1, H=1, H/D=0.5, HP(full)=2, H-H/D(half-on-holiday)=1.5.
 * (Absent=0.)
 */
export function payableDaysFromSummary(r: AltusLogMonthRow): number {
  return (
    r.present * 1 +
    r.weeklyOff * 1 +
    r.holiday * 1 +
    r.halfDay * 0.5 +
    r.holidayPresentFull * 2 +
    r.holidayPresentHalf * 1.5
  );
}

/** Parse the col-2 month value (Date or date-ish string) to canonical "YYYY-MM".
 *  Uses UTC throughout to avoid timezone drift. Returns null if unparseable. */
export function monthFromCell(cell: unknown): string | null {
  if (cell == null) return null;

  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return fmt(cell.getUTCFullYear(), cell.getUTCMonth() + 1);
  }

  if (typeof cell === "string") {
    const s = cell.trim();
    if (s === "") return null;
    // "YYYY-MM-DD…" → first 7 chars.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
    // already "YYYY-MM".
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    // last resort: let the engine try (treats e.g. ISO timestamps).
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1);
    }
    return null;
  }

  return null;
}

/** Map raw sheet AoA rows (including the header row 0) to typed month rows.
 *  Skips the header row, blank-employee-name rows, and unparseable-month rows. */
export function mapSummaryRows(rows: unknown[][]): AltusLogMonthRow[] {
  const out: AltusLogMonthRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const employeeName = str(row[3]);
    if (!employeeName) continue;

    const month = monthFromCell(row[2]);
    if (!month) continue;

    out.push({
      fy: str(row[1]) ?? "",
      month,
      employeeName,
      designation: str(row[4]),
      entity: str(row[5]),
      present: num(row[6]),
      holiday: num(row[7]),
      weeklyOff: num(row[8]),
      holidayPresentFull: num(row[9]),
      holidayPresentHalf: num(row[10]),
      halfDay: num(row[11]),
      absent: num(row[12]),
      daysInMonth: num(row[13]),
      totalWorked: num(row[14]),
    });
  }

  return out;
}

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(year: number, month1: number): string {
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}`;
}

/** Trim a cell to a non-empty string, else null. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Coerce a numeric cell, defaulting to 0 for blanks/non-numbers. */
function num(v: unknown): number {
  return Number(v) || 0;
}
