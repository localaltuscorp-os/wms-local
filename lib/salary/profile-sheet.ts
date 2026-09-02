/**
 * Pure mapper from the "Altus Corp Salary Payment" → **Salary Breakup** tab
 * (raw array-of-arrays from the Sheets API `values` read) to one current
 * salary-profile record PER EMPLOYEE.
 *
 * The tab carries one row per employee-per-month (newest block on top, a header
 * row, then the full historical archive). For salary PROFILES we only want each
 * person's *current* CTC, so we keep the row with the LATEST month per name.
 *
 * Dependency-free + total: bad/junk/header rows are simply skipped (their month
 * cell won't parse), so the header row and the "Auto"/"For Account Dept" marker
 * rows fall away naturally.
 *
 * Column layout (fixed index, matches lib/salary/altus-log-import.ts):
 *   [2]  C  MM-YY ("May-2026")      [3]  D  Employee Name
 *   [4]  E  Designation             [5]  F  Company Name (paying entity)
 *   [18] S  Annually CTC ("₹228,000")   [21] V  PT ("₹200" or blank → exempt)
 */

const COL = { month: 2, name: 3, designation: 4, entity: 5, ctc: 18, pt: 21 } as const;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "May-2026" / "Apr 2022" / "Sep-2024" → canonical "YYYY-MM" (chronologically
 *  sortable as a string). Returns null for anything that isn't a month label. */
export function parseSheetMonth(raw: string): string | null {
  const m = (raw ?? "").toString().trim().match(/^([A-Za-z]{3,})[-\s/]?(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
  return mm ? `${m[2]}-${mm}` : null;
}

/** "₹228,000" / "228000" → 228000. Blank/non-numeric → null. */
export function parseRupees(raw: string): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[₹,\s]/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sheet name → app `employees.name`, for current employees whose sheet spelling
 * differs (spelling variants, middle names, a surname change). Reviewed by the
 * admin on 2026-06-19. Matching normalizes both sides (collapse ws, lowercase),
 * so casing/spacing here is just for readability. Keep this curated — never
 * fuzzy-match salary data automatically.
 */
export const SALARY_NAME_ALIASES: Record<string, string> = {
  "Rohan Chowdhary": "Rohan Choudhary",
  "Dhruv Javeri": "Dhruv Jhaveri",
  "Prakash Kumavat": "Prakash Kumawat",
  "Pukharaj Munilal Suthar": "Pukhraj Suthar",
  "Pratham Rajendra Medhekar": "Pratham Medhekar",
  "Siddhi Rajendra Lakade": "Siddhi Lakade",
  Hardik: "Hardik Bhutada",
  "Dhanshree Shigvan": "Dhanshree solkar",
};

export interface SalaryProfileSheetRow {
  /** Collapsed-whitespace display name (the sheet has stray double spaces). */
  employeeName: string;
  /** Latest month this CTC was seen, canonical "YYYY-MM" (for display). */
  month: string;
  annualCtc: number;
  /** True when no PT was charged in the sheet (blank/0 PT cell). */
  ptExempt: boolean;
  designation: string | null;
  payingEntity: string | null;
}

/**
 * Reduce the raw Salary Breakup matrix to one row per employee — the row with
 * the most recent month that has a positive CTC. Rows without a parseable
 * month, a name, or a positive CTC are skipped.
 */
export function mapSalaryProfileRows(matrix: unknown[][]): SalaryProfileSheetRow[] {
  const latest = new Map<string, SalaryProfileSheetRow>();

  for (const r of matrix) {
    if (!Array.isArray(r)) continue;
    const name = (r[COL.name] ?? "").toString().replace(/\s+/g, " ").trim();
    const month = parseSheetMonth((r[COL.month] ?? "").toString());
    if (!name || !month) continue; // junk + header rows fall away here

    const ctc = parseRupees((r[COL.ctc] ?? "").toString());
    if (ctc == null || ctc <= 0) continue; // no CTC → nothing to import

    const pt = parseRupees((r[COL.pt] ?? "").toString()) ?? 0;
    const designation =
      (r[COL.designation] ?? "").toString().replace(/\s+/g, " ").trim() || null;
    const payingEntity =
      (r[COL.entity] ?? "").toString().replace(/\s+/g, " ").trim() || null;

    const key = name.toLowerCase();
    const prev = latest.get(key);
    if (!prev || month > prev.month) {
      latest.set(key, {
        employeeName: name,
        month,
        annualCtc: ctc,
        ptExempt: pt <= 0,
        designation,
        payingEntity,
      });
    }
  }

  return [...latest.values()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName),
  );
}
