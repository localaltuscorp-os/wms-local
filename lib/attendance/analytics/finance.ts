import "server-only";
import { db } from "@/lib/db";
import { salaryProfiles } from "@/db/schema";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { isMonthFrozen } from "@/lib/reports/attendance-freeze";

/**
 * FINANCE / payroll-impact attendance analytics — the "money view" of a month's
 * attendance. It composes the graded attendance dashboard
 * (`getMonthDashboard`, one batched query for the whole roster) with a single
 * batched read of every employee's `annualCtc` and decomposes the salary lost
 * to attendance into four rupee buckets.
 *
 * ── Per-day rate convention (IMPORTANT — the codebase has TWO) ──────────────
 * We use the PAYROLL-ENGINE convention from `lib/salary/compute.ts`:
 *
 *     monthlyCtc = annualCtc / 12
 *     perDay     = monthlyCtc / daysInMonth        (calendar days, 28–31)
 *
 * NOT the `attendance-summary.ts` self-view convention (monthlyGross ÷ working
 * days). Reason: this dashboard is the payroll-impact view, so its numbers must
 * tie out to the money the salary engine actually computes (gross = perDay ×
 * effectiveDays). Using the same divisor keeps "salary lost" reconcilable with
 * the payslip. Documented here so nobody "fixes" it to the other convention.
 *
 * ── Deduction buckets (rupees) ──────────────────────────────────────────────
 *     absence      = absentDays        × perDay
 *     half-day     = halfDay × 0.5      × perDay
 *     unpaid-leave = unpaidLeave (LWP)  × perDay
 *     late-penalty = 0 — RETIRED (the hours rule prices a short day; payroll
 *                    sets applyLate = false, so this projection matches it)
 *     total lost   = Σ of the four
 *
 * Money is exposed as integer rupees (no paise) — this is an executive/finance
 * read-out, and the payslip keeps the exact 2-dp figure elsewhere.
 *
 * ── Guard ───────────────────────────────────────────────────────────────────
 * An employee with NO salary profile (or annualCtc ≤ 0) contributes ZERO rupees
 * to every total (`hasSalaryProfile: false`) but still shows their day COUNTS,
 * so the row is informative and nothing ever divides by an absent CTC.
 */

/** Human label for the per-day convention (rendered in the UI footnote). */
export const PER_DAY_CONVENTION =
  "annualCtc ÷ 12 ÷ calendar-days-in-month (matches lib/salary/compute.ts)";

export interface FinanceEmployeeRow {
  employeeId: string;
  name: string;
  department: string | null;
  /** false ⇒ no salary_profiles row or annualCtc ≤ 0 ⇒ all ₹ fields are 0. */
  hasSalaryProfile: boolean;
  monthlyCtc: number; // ₹, integer (annualCtc / 12)
  perDay: number; // ₹, integer (monthlyCtc / daysInMonth)
  // ── raw day counts (always present, profile or not) ──
  absentDays: number;
  halfDays: number;
  unpaidLeaveDays: number;
  lateMarks: number; // un-waived lates
  latePenaltyDays: number; // floor(lateMarks / 3) × 0.5
  payableDays: number;
  // ── rupee buckets (0 when hasSalaryProfile is false) ──
  absenceLoss: number;
  halfDayLoss: number;
  unpaidLeaveLoss: number;
  latePenaltyLoss: number;
  totalLoss: number;
  /** Estimated take-home for the month: monthlyCtc − totalLoss (floored at 0). */
  projectedPay: number;
}

export interface FinanceBucketTotals {
  absence: number;
  halfDay: number;
  unpaidLeave: number;
  latePenalty: number;
}

export interface FinanceDeptRow {
  department: string;
  headcount: number;
  totalLoss: number;
  projectedPay: number;
}

export interface FinanceAttendanceAnalytics {
  year: number;
  month: number; // 1-12
  monthKey: string; // YYYY-MM
  daysInMonth: number;
  /** Attendance freeze status for the month (fail-open false on any read error). */
  isFrozen: boolean;
  perDayConvention: string;
  // ── headline scalars (₹ integer) ──
  headcount: number;
  withSalaryProfile: number;
  withoutSalaryProfile: number;
  /** Employees with a non-zero rupee loss this month. */
  headcountWithDeductions: number;
  totalSalaryLost: number;
  bucketTotals: FinanceBucketTotals;
  /** Σ monthlyCtc across employees WITH a salary profile. */
  totalMonthlyCtc: number;
  /** ESTIMATE — Σ (monthlyCtc − totalLoss). Ignores PT/TDS/advances/comp-off. */
  projectedPayroll: number;
  // ── breakdowns ──
  departments: FinanceDeptRow[]; // highest payroll loss first
  employees: FinanceEmployeeRow[]; // highest loss first
}

/** Integer rupees. */
const rupees = (n: number): number => Math.round(n);

/** Calendar days in a (year, month 1-12). */
function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Load the finance / payroll-impact analytics for a month.
 *
 * @param year        full year (e.g. 2026)
 * @param month       1-12
 * @param refTodayISO "today" as YYYY-MM-DD in the reporting tz — passed straight
 *                    to `getMonthDashboard` so the live row grades against the
 *                    live clock and past rows against end-of-day.
 */
export async function loadFinanceAttendanceAnalytics(
  year: number,
  month: number,
  refTodayISO: string,
): Promise<FinanceAttendanceAnalytics> {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = daysInMonthOf(year, month);

  // ONE batched attendance grade + ONE profile read + the freeze flag, in
  // parallel. The profile read and freeze read fail-open (empty / false) so a
  // missing table never crashes the money view.
  const [rows, profileRows, isFrozen] = await Promise.all([
    getMonthDashboard(year, month, refTodayISO),
    db
      .select({
        employeeId: salaryProfiles.employeeId,
        annualCtc: salaryProfiles.annualCtc,
      })
      .from(salaryProfiles)
      .catch(() => [] as { employeeId: string; annualCtc: string }[]),
    isMonthFrozen(monthKey).catch(() => false),
  ]);

  // employeeId → annualCtc (rupees). Numeric columns come back as strings.
  const ctcByEmp = new Map<string, number>();
  for (const p of profileRows) {
    const v = Number(p.annualCtc);
    if (Number.isFinite(v) && v > 0) ctcByEmp.set(p.employeeId, v);
  }

  const employees: FinanceEmployeeRow[] = [];
  const bucketTotals: FinanceBucketTotals = {
    absence: 0,
    halfDay: 0,
    unpaidLeave: 0,
    latePenalty: 0,
  };
  let totalMonthlyCtc = 0;

  for (const r of rows) {
    const s = r.summary;
    const absentDays = s.absent;
    const halfDays = s.halfDay;
    const unpaidLeaveDays = s.unpaidLeave;
    const lateMarks = s.late; // un-waived
    // RETIRED RULE — payroll no longer deducts for late marks (the hours rule
    // already prices a short day; see generate.ts `applyLate = false`). This
    // projection must not show a deduction the payslip will never make, so the
    // bucket is pinned to zero. Marks themselves are still counted and shown.
    const latePenaltyDays = 0;

    const annualCtc = ctcByEmp.get(r.employeeId);
    const hasSalaryProfile = annualCtc != null;
    const monthlyCtc = hasSalaryProfile ? rupees(annualCtc / 12) : 0;
    // Payroll-engine convention (see file header): perDay = monthlyCtc / daysInMonth.
    const perDayExact =
      hasSalaryProfile && daysInMonth > 0 ? annualCtc / 12 / daysInMonth : 0;

    const absenceLoss = hasSalaryProfile ? rupees(absentDays * perDayExact) : 0;
    const halfDayLoss = hasSalaryProfile ? rupees(halfDays * 0.5 * perDayExact) : 0;
    const unpaidLeaveLoss = hasSalaryProfile
      ? rupees(unpaidLeaveDays * perDayExact)
      : 0;
    const latePenaltyLoss = hasSalaryProfile
      ? rupees(latePenaltyDays * perDayExact)
      : 0;
    const totalLoss = absenceLoss + halfDayLoss + unpaidLeaveLoss + latePenaltyLoss;
    const projectedPay = hasSalaryProfile ? Math.max(0, monthlyCtc - totalLoss) : 0;

    if (hasSalaryProfile) {
      totalMonthlyCtc += monthlyCtc;
      bucketTotals.absence += absenceLoss;
      bucketTotals.halfDay += halfDayLoss;
      bucketTotals.unpaidLeave += unpaidLeaveLoss;
      bucketTotals.latePenalty += latePenaltyLoss;
    }

    employees.push({
      employeeId: r.employeeId,
      name: r.name,
      department: r.department,
      hasSalaryProfile,
      monthlyCtc,
      perDay: rupees(perDayExact),
      absentDays,
      halfDays,
      unpaidLeaveDays,
      lateMarks,
      latePenaltyDays,
      payableDays: s.payableDays,
      absenceLoss,
      halfDayLoss,
      unpaidLeaveLoss,
      latePenaltyLoss,
      totalLoss,
      projectedPay,
    });
  }

  employees.sort((a, b) => b.totalLoss - a.totalLoss || a.name.localeCompare(b.name));

  const totalSalaryLost =
    bucketTotals.absence +
    bucketTotals.halfDay +
    bucketTotals.unpaidLeave +
    bucketTotals.latePenalty;

  // Per-department payroll loss.
  const deptMap = new Map<string, FinanceDeptRow>();
  for (const e of employees) {
    const key = e.department ?? "Unassigned";
    let row = deptMap.get(key);
    if (!row) {
      row = { department: key, headcount: 0, totalLoss: 0, projectedPay: 0 };
      deptMap.set(key, row);
    }
    row.headcount += 1;
    row.totalLoss += e.totalLoss;
    row.projectedPay += e.projectedPay;
  }
  const departments = Array.from(deptMap.values()).sort(
    (a, b) => b.totalLoss - a.totalLoss || a.department.localeCompare(b.department),
  );

  const withSalaryProfile = employees.filter((e) => e.hasSalaryProfile).length;

  return {
    year,
    month,
    monthKey,
    daysInMonth,
    isFrozen,
    perDayConvention: PER_DAY_CONVENTION,
    headcount: employees.length,
    withSalaryProfile,
    withoutSalaryProfile: employees.length - withSalaryProfile,
    headcountWithDeductions: employees.filter((e) => e.totalLoss > 0).length,
    totalSalaryLost,
    bucketTotals,
    totalMonthlyCtc,
    projectedPayroll: Math.max(0, totalMonthlyCtc - totalSalaryLost),
    departments,
    employees,
  };
}
