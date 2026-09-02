import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, payingEntities } from "@/db/schema";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { getRetentionBonus } from "@/lib/queries/salary-ctc-store";
import {
  getIncentiveTargetVsPaidForPerson,
  type IncentiveTargetVsPaidForPerson,
} from "@/lib/queries/earnings";
import { monthLabel, fyForMonth } from "@/lib/salary/period";

/**
 * WS-5 + WS-6 — Combined "total earnings" document for one person + month.
 *
 * ONE read-only document that shows, for a single month:
 *   1. SALARY      — the imported salary-sheet figures for that month (live).
 *   2. ATTENDANCE  — an analytics summary (present / late / waived / left-early),
 *                    each as X/N so discipline is legible.
 *   3. INCENTIVE   — Target-vs-PAID for this month / last 3 months / YTD, with
 *                    PAID read through the canonical getIncentivePaidByPerson
 *                    (aliased in lib/queries/earnings.ts — never re-implemented).
 *   4. RETENTION   — the Retention Bonus line, included ONLY when actually paid.
 *
 * …so the person sees TOTAL earnings for the month in one place. No money is
 * mutated or recomputed here; it aggregates existing sources. The document
 * route is gated by the SALARY_STATEMENTS kill-switch.
 *
 * SCOPE NOTE: attendance discipline is summarised for THIS month (X/N with %).
 * The WS-5 "last-3-months / YTD attendance averages" would require re-grading
 * several months of punches (a heavy scan); that is intentionally deferred (see
 * INTEGRATION NOTE) to keep this on-demand document load-neutral. The incentive
 * this/last-3/YTD windows (the combined-doc's headline requirement) ARE included
 * because that ledger is small.
 */

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface CombinedSalary {
  monthlyCtc: number;
  finalWorkingDays: number;
  daysInMonth: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  remarks: string | null;
}

export interface CombinedAttendance {
  present: number;
  absent: number;
  halfDay: number;
  weeklyOff: number;
  payableDays: number;
  daysInMonth: number;
  /** X/N ratios for the discipline lines. */
  lateDays: number; // days arrived late (incl. those later waived)
  waivedDays: number; // late days waived to a full day
  leftEarlyDays: number;
  /** Total hours worked in the month — what payable days are derived from. */
  workedHours: number;
}

export interface CombinedRetention {
  amount: number;
  payableDate: string | null;
  paidDate: string | null;
  note: string | null;
  /** True when the paid date falls inside the document month. */
  paidThisMonth: boolean;
}

export interface CombinedEarnings {
  employeeId: string;
  employeeName: string;
  designation: string | null;
  entity: string | null;
  month: string; // YYYY-MM
  monthLabel: string;
  fy: string;
  salary: CombinedSalary | null;
  attendance: CombinedAttendance;
  incentive: IncentiveTargetVsPaidForPerson;
  /** Present ONLY when the retention bonus has been paid (else null). */
  retention: CombinedRetention | null;
  /** Salary final payment + incentive PAID this month + retention paid this month. */
  totalEarnings: number;
}

/** "today" (YYYY-MM-DD) in IST — the reference day the attendance grader needs. */
function istTodayISO(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Assemble the combined earnings document for `employeeId` + `month` ("YYYY-MM").
 * `personName` seeds the incentive name-key match; when omitted it is taken from
 * the salary sheet row (falling back to the id-only match).
 */
export async function getCombinedEarnings(
  employeeId: string,
  month: string,
  personName?: string,
): Promise<CombinedEarnings> {
  const [y, m] = month.split("-").map(Number) as [number, number];

  const [sheetRows, attStatus, retention, payingEntity] = await Promise.all([
    mySalaryBreakup(employeeId),
    getEmployeeMonthStatus(employeeId, y, m, istTodayISO()),
    getRetentionBonus(employeeId),
    // The employee's OWN paying entity — the slip's logo + signatory follow it.
    // The legacy sheet's companyName is only a fallback now: it is null whenever
    // there is no sheet row for the month, which silently branded every such slip
    // as Altus Corp regardless of who actually paid.
    db
      .select({ name: payingEntities.name })
      .from(employees)
      .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
      .where(eq(employees.id, employeeId))
      .limit(1)
      .then((r) => r[0]?.name ?? null)
      .catch(() => null),
  ]);

  const sheetRow = sheetRows.find((r) => String(r.month).slice(0, 7) === month) ?? null;
  const name =
    personName?.trim() ||
    sheetRow?.employeeName ||
    sheetRows[0]?.employeeName ||
    "Employee";

  const incentive = await getIncentiveTargetVsPaidForPerson(
    { id: employeeId, name },
    month,
  );

  const salary: CombinedSalary | null = sheetRow
    ? {
        monthlyCtc: num(sheetRow.monthlyCtc),
        finalWorkingDays: num(sheetRow.finalWorkingDays),
        daysInMonth: num(sheetRow.daysInMonth),
        payableAfterPt: num(sheetRow.payableAfterPt),
        advance: num(sheetRow.advance),
        previousPending: num(sheetRow.previousPending),
        finalPayment: num(sheetRow.finalPayment),
        remarks: sheetRow.remarks ?? null,
      }
    : null;

  const s = attStatus.summary;
  const attendance: CombinedAttendance = {
    present: s.present,
    absent: s.absent,
    halfDay: s.halfDay,
    weeklyOff: s.weeklyOff,
    payableDays: s.payableDays,
    daysInMonth: attStatus.days.length,
    lateDays: s.lateRaw,
    waivedDays: s.lateWaived,
    leftEarlyDays: s.leftEarly,
    // Hours drive payable days now (9h = 1 day, 54h = a full week), so the slip
    // shows the hours the days were earned from.
    workedHours: Math.round((s.totalWorkedMinutes / 60) * 10) / 10,
  };

  // Retention bonus — surface ONLY when paid (spec: hidden otherwise).
  let ret: CombinedRetention | null = null;
  if (retention && retention.paid) {
    const paidThisMonth =
      retention.paidDate != null && retention.paidDate.slice(0, 7) === month;
    ret = {
      amount: retention.amount,
      payableDate: retention.payableDate,
      paidDate: retention.paidDate,
      note: retention.note,
      paidThisMonth,
    };
  }

  const totalEarnings =
    (salary?.finalPayment ?? 0) +
    incentive.thisMonth.paid +
    (ret?.paidThisMonth ? ret.amount : 0);

  return {
    employeeId,
    employeeName: name,
    designation: sheetRow?.designation ?? null,
    entity: payingEntity ?? sheetRow?.companyName ?? null,
    month,
    monthLabel: monthLabel(month),
    fy: fyForMonth(month),
    salary,
    attendance,
    incentive,
    retention: ret,
    totalEarnings,
  };
}
