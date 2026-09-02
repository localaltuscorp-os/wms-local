/**
 * Pure mapper for the LIVE salary-breakup Google Sheet → typed rows for the
 * `salary_breakup` upsert (lib/salary/breakup-sync.ts).
 *
 * Mirrors the fixed 29-column layout of scripts/import-salary-breakup.ts
 * (the one-off xlsx importer this live sync supersedes):
 *   [0] Sr No · [1] FY · [2] Month · [3] Employee Name · [4] Designation ·
 *   [5] Company Name · [6] Present · [7] Holiday · [8] Weekly Off ·
 *   [9] POH Full · [10] POH Half · [11] Half Day · [12] Absent ·
 *   [13] Days In Month · [14] Total Days Worked · [15] Set Off · [16] CF ·
 *   [17] Final Working Days · [18] Annual CTC · [19] Monthly CTC ·
 *   [20] Payable After Leave · [21] PT · [22] Payable After PT · [23] Advance ·
 *   [24] Previous Pending · [25] Final Payment · [26] Salary Given ·
 *   [27] Remarks · [28] Manan Remarks
 *
 * Dependency-free + TOTAL: a malformed row is skipped and counted, never
 * thrown — one bad sheet row must never abort (or corrupt) a sync run.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ── SINGLE CONFIG POINT ─ fill in when the live sheet is shared ─────────────
// The spreadsheet ID + tab/range are NOT known yet (do not guess them).
// 1. Share the live salary sheet with FIREBASE_CLIENT_EMAIL (Viewer).
// 2. Set both env vars in Vercel + .env.local:
//      SALARY_SHEET_ID    = <spreadsheet id from the sheet URL>
//      SALARY_SHEET_RANGE = <'Tab Name'!A1:AC4000 — confirm tab + last column>
// 3. If the live tab's header block differs from the xlsx (data started at
//    row index 3 there), adjust SALARY_SHEET_DATA_START_ROW too.
// The sync engine refuses to run (clean no-op) until both env vars are set.
// ═══════════════════════════════════════════════════════════════════════════
// Live "Altus Corp Salary Payment" sheet (shared with FIREBASE_CLIENT_EMAIL,
// 2026-07-09). Tab "Salary Breakup" (gid=0) — 29-col layout above; data starts
// at row 4 (index 3: the "Go to Attendance" row, the header row, the "Auto"
// row precede it). Baked as defaults (the id is public, in the URL) so the
// in-app "Sync from sheet" button works without a Vercel env change; still
// overridable via the same env vars.
export const SALARY_SHEET_ID =
  process.env.SALARY_SHEET_ID ?? "13dHs7Klp4_Eb3JUvhzTYEgQsmX-rLFfR2ZwZK9hcgrU";
export const SALARY_SHEET_RANGE =
  process.env.SALARY_SHEET_RANGE ?? "'Salary Breakup'!A1:AC4000";
export const SALARY_SHEET_DATA_START_ROW = Number(
  process.env.SALARY_SHEET_DATA_START_ROW ?? "3",
);

/** Null when configured; otherwise a safe, admin-showable reason. */
export function salarySyncConfigError(): string | null {
  if (!SALARY_SHEET_ID || !SALARY_SHEET_RANGE) {
    return "Salary sync is not configured yet (SALARY_SHEET_ID / SALARY_SHEET_RANGE env vars are missing).";
  }
  return null;
}

/** One parsed sheet row, 1:1 with the salary_breakup columns. */
export interface SalaryBreakupSheetRow {
  srNo: number | null;
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
  setOff: number | null;
  cf: number | null;
  finalWorkingDays: number;
  annualCtc: number;
  monthlyCtc: number;
  payableAfterLeave: number;
  pt: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  salaryGiven: number | null;
  remarks: string | null;
  mananRemarks: string | null;
}

export interface SalaryBreakupMapResult {
  rows: SalaryBreakupSheetRow[];
  /** Rows in range that had no employee name / unparseable month (counted, not kept). */
  skipped: number;
}

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  // The Sheets API returns formatted strings — strip ₹ / commas / spaces.
  const s = String(v).replace(/[₹,\s]/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const num0 = (v: unknown): number => numOrNull(v) ?? 0;
const txt = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Parse the month cell to 'YYYY-MM-01'. Tolerant of the formats a live Sheets
 * read can produce (the xlsx importer only saw Excel serials):
 *  - Excel/Sheets serial number (or numeric string) — e.g. "45748"
 *  - "YYYY-MM-DD…" / "YYYY-MM"
 *  - "DD/MM/YYYY" or "DD-MM-YYYY" (Indian sheet locale, day-first)
 *  - anything Date-parseable as a last resort (UTC to avoid tz drift)
 * Returns null (row skipped) when unparseable.
 */
export function monthBucketFromCell(cell: unknown): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (s === "") return null;

  // Excel serial (raw number or numeric string).
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return fmtMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  // ISO-ish.
  if (/^\d{4}-\d{2}(-\d{2})?/.test(s)) return `${s.slice(0, 7)}-01`;
  // Day-first (dd/mm/yyyy or dd-mm-yyyy) — the common Indian sheet format.
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dayFirst) {
    const mo = Number(dayFirst[2]);
    const y = Number(dayFirst[3]);
    if (mo >= 1 && mo <= 12) return fmtMonth(y, mo);
    return null;
  }
  // "Mon-YYYY" / "Mon-YY" / "Mon YYYY" — the LIVE sheet's text month format
  // (e.g. "May-2026"). Parse the month NAME directly: NEVER via new Date(),
  // which parses at local midnight and, read back as UTC, silently shifts the
  // month back one (IST "May 1 00:00" → UTC "Apr 30 18:30" → April). That bug
  // would have mis-stamped every salary month.
  const named = /^([A-Za-z]{3,9})[\s/-]+(\d{2,4})$/.exec(s);
  if (named) {
    const mo = MONTH_INDEX[named[1]!.slice(0, 3).toLowerCase()];
    if (mo) {
      let y = Number(named[2]);
      if (y < 100) y += 2000;
      return fmtMonth(y, mo);
    }
  }
  return null;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function fmtMonth(y: number, mo: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-01`;
}

/**
 * Map the raw Sheets matrix (readSheetValuesReadonly output) to typed rows.
 * Data begins at SALARY_SHEET_DATA_START_ROW; a row is kept only when it has
 * an employee name (col 3) AND a parseable month (col 2) — same keep-rule as
 * the xlsx importer, so the two can never disagree about what counts as data.
 */
export function mapSalaryBreakupRows(matrix: string[][]): SalaryBreakupMapResult {
  const rows: SalaryBreakupSheetRow[] = [];
  let skipped = 0;

  for (let i = SALARY_SHEET_DATA_START_ROW; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue; // blank line — not "skipped"

    const employeeName = txt(r[3]);
    const month = monthBucketFromCell(r[2]);
    if (!employeeName || !month) {
      skipped++;
      continue;
    }

    rows.push({
      srNo: numOrNull(r[0]),
      fy: txt(r[1]),
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
      setOff: numOrNull(r[15]),
      cf: numOrNull(r[16]),
      finalWorkingDays: num0(r[17]),
      annualCtc: num0(r[18]),
      monthlyCtc: num0(r[19]),
      payableAfterLeave: num0(r[20]),
      pt: num0(r[21]),
      payableAfterPt: num0(r[22]),
      advance: num0(r[23]),
      previousPending: num0(r[24]),
      finalPayment: num0(r[25]),
      salaryGiven: numOrNull(r[26]),
      remarks: txt(r[27]),
      mananRemarks: txt(r[28]),
    });
  }

  return { rows, skipped };
}
