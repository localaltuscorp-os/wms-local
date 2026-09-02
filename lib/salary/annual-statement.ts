import "server-only";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { fyForMonth, monthLabel } from "@/lib/salary/period";

/**
 * WS-5 — Annual Salary Statement (1 April → 31 March).
 *
 * Assembles one employee's per-month pay across a financial year and a year
 * total. This is a READ-ONLY document: it reads the LIVE imported salary sheet
 * (`salary_breakup`, via `mySalaryBreakup`) — the same source the /salary page
 * shows — and never mutates or recomputes any money. It therefore does NOT sit
 * behind the SALARY_V2 math flag (it reports numbers, it doesn't produce them);
 * the document *route* is gated by the SALARY_STATEMENTS kill-switch instead.
 *
 * The FY is identified by its START calendar year: FY starting April 2026 →
 * `startYear = 2026`, covering 2026-04 … 2027-03 (label "FY 26-27").
 */

export interface AnnualStatementMonth {
  /** "YYYY-MM". */
  month: string;
  /** "Apr 2026". */
  label: string;
  /** True when the sheet has a row for this month (else a zero/blank month). */
  present: boolean;
  daysInMonth: number;
  finalWorkingDays: number;
  monthlyCtc: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  remarks: string | null;
}

export interface AnnualStatement {
  employeeId: string;
  employeeName: string;
  designation: string | null;
  /** Paying entity / company as recorded on the sheet (drives the signatory). */
  companyName: string | null;
  /** "FY 26-27". */
  fy: string;
  /** FY start calendar year (e.g. 2026 for FY 26-27). */
  startYear: number;
  months: AnnualStatementMonth[];
  totals: {
    payableAfterPt: number;
    advance: number;
    finalPayment: number;
    /** Count of months that actually have a sheet row. */
    monthsPaid: number;
  };
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** FY start calendar year for "today" in IST (Apr–Mar boundary). */
export function currentFyStartYear(): number {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1; // 1-12
  return m >= 4 ? y : y - 1;
}

/** The 12 "YYYY-MM" months of the FY starting April `startYear`. */
export function fyMonths(startYear: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const monthIndex = 4 + i; // 4..15
    const year = startYear + (monthIndex > 12 ? 1 : 0);
    const mm = ((monthIndex - 1) % 12) + 1;
    out.push(`${year}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Build the annual statement for one employee + FY. Employees with no sheet
 * rows in the FY still produce a valid (all-zero) 12-month statement, so the
 * document never throws — it just prints an empty year.
 */
export async function getAnnualStatement(
  employeeId: string,
  startYear: number,
): Promise<AnnualStatement> {
  const rows = await mySalaryBreakup(employeeId);
  const months = fyMonths(startYear);
  const monthSet = new Set(months);

  // Index the employee's sheet rows by "YYYY-MM" (month col is a YYYY-MM-DD date).
  const byMonth = new Map<string, (typeof rows)[number]>();
  let employeeName = "";
  let designation: string | null = null;
  let companyName: string | null = null;
  for (const r of rows) {
    const ym = String(r.month).slice(0, 7);
    if (!monthSet.has(ym)) continue;
    byMonth.set(ym, r);
    // Take identity from the most recent matching row (rows are newest-first).
    if (!employeeName) {
      employeeName = r.employeeName;
      designation = r.designation ?? null;
      companyName = r.companyName ?? null;
    }
  }

  const monthRows: AnnualStatementMonth[] = months.map((m) => {
    const r = byMonth.get(m);
    if (!r) {
      return {
        month: m,
        label: monthLabel(m),
        present: false,
        daysInMonth: 0,
        finalWorkingDays: 0,
        monthlyCtc: 0,
        payableAfterPt: 0,
        advance: 0,
        previousPending: 0,
        finalPayment: 0,
        remarks: null,
      };
    }
    return {
      month: m,
      label: monthLabel(m),
      present: true,
      daysInMonth: num(r.daysInMonth),
      finalWorkingDays: num(r.finalWorkingDays),
      monthlyCtc: num(r.monthlyCtc),
      payableAfterPt: num(r.payableAfterPt),
      advance: num(r.advance),
      previousPending: num(r.previousPending),
      finalPayment: num(r.finalPayment),
      remarks: r.remarks ?? null,
    };
  });

  const totals = monthRows.reduce(
    (acc, m) => {
      acc.payableAfterPt += m.payableAfterPt;
      acc.advance += m.advance;
      acc.finalPayment += m.finalPayment;
      if (m.present) acc.monthsPaid += 1;
      return acc;
    },
    { payableAfterPt: 0, advance: 0, finalPayment: 0, monthsPaid: 0 },
  );

  return {
    employeeId,
    employeeName: employeeName || "Employee",
    designation,
    companyName,
    fy: fyForMonth(`${startYear}-04`),
    startYear,
    months: monthRows,
    totals,
  };
}
