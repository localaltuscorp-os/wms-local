import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { designations, employees, functions, payingEntities } from "@/db/schema";
import { loadMySalaryMonths, type MySalaryMonth } from "@/lib/salary/my-salary";
import type { DayLedger } from "@/lib/salary/day-ledger";
import { getRetentionBonus } from "@/lib/queries/salary-ctc-store";
import {
  getIncentiveAccountsLedger,
  type IncentiveAccountsLedger,
} from "@/lib/queries/incentive-accounts";
import { getIncentiveTargetVsPaidForPerson, type IncentiveTargetVsPaidForPerson } from "@/lib/queries/earnings";
import { listActiveProductCodes } from "@/lib/queries/products";
import { listIncentiveRequests, type IncentiveRequestRow } from "@/lib/queries/incentive";
import {
  requestIntroducerName,
  requestProductCodes,
  requestProductNames,
  requestProspectName,
} from "@/lib/incentive/request-display";
import { INCENTIVE_DATE_KEY } from "@/lib/incentive-fields";
import { localDateString } from "@/lib/format";
import { fyForMonth, monthLabel as periodMonthLabel } from "@/lib/salary/period";
import { getReimbursementsForMonth, type ReimbursementEarnings } from "@/lib/salary/reimbursement-earnings";
import { lastNMonths, ytdMonths } from "@/lib/salary/attendance-metrics";
import { INCENTIVE_TYPE_LABELS } from "@/db/enums";

/**
 * EVERY FIGURE THE 3-PAGE SALARY PDF NEEDS, GATHERED FROM THE ENGINES THAT
 * ALREADY OWN THEM.
 *
 * This module does no arithmetic on money, days or hours. It reads:
 *
 *   · SALARY + ATTENDANCE — `loadMySalaryMonths`, the one engine behind
 *     Employee → My Salary, with its day ledger attached. The PDF therefore
 *     prints what the employee's own page prints, to the rupee, because it is
 *     the same computation rather than a copy of it.
 *   · INCENTIVE — the Accounts ledger (`getIncentiveAccountsLedger`), the
 *     target-vs-paid windows (`getIncentiveTargetVsPaidForPerson`) and the
 *     employee's own incentive requests for the month.
 *   · REIMBURSEMENT — the Reimbursements module's own records.
 *   · RETENTION — the retention store.
 *
 * ── WHY THE REQUESTS AND THE LEDGER ARE BOTH HERE ──────────────────────────
 * The incentive module keeps two records that do not share a key: a REQUEST
 * carries what was submitted (prospect, introducer, product, the date it was
 * earned) and the LEDGER carries what is owed and paid. Nothing links them, so
 * the statement prints them as two tables rather than inventing a join — see
 * `SalarySlipData.incentive`.
 *
 * ── A NOTE ON THE ONE WRITE ────────────────────────────────────────────────
 * `loadMySalaryMonths` refreshes the open month's stored run on read (throttled
 * to once per five minutes) — exactly as the My Salary page does. Reusing it is
 * the point: the alternative is a second computation of the same month, which
 * is how the page and the payslip came to disagree in the first place.
 */

export interface SalarySlipIdentity {
  employeeId: string;
  name: string;
  code: string | null;
  designation: string | null;
  /** The department's FUNCTION name (`functions.name`). */
  fn: string | null;
  entity: string | null;
  /** How they are paid — "Full Time", "Hourly" … as the WMS words it. */
  workerType: string | null;
  /** "2024-06-03" or null. */
  doj: string | null;
  month: string;
  monthLabel: string;
  fy: string;
  daysInMonth: number;
}

export interface SalarySlipEarningsLine {
  label: string;
  amount: number;
}

export interface SalarySlipDeductionLine {
  label: string;
  amount: number;
}

export interface SalarySlipSalary {
  monthlyCtc: number;
  perDay: number;
  payableDays: number;
  earnings: SalarySlipEarningsLine[];
  gross: number;
  /**
   * Money added AFTER the gross — a previous month's pending balance carried
   * in. The engine's own rule (`compute.ts`) is
   * `net = gross − pt − tds − advances + pendingBalanceIn`, so a positive
   * pending is an ADDITION; only a negative one is a deduction.
   */
  additions: SalarySlipEarningsLine[];
  additionTotal: number;
  deductions: SalarySlipDeductionLine[];
  deductionTotal: number;
  net: number;
  /**
   * The attendance shortfall the earnings already reflect — the figure the
   * slip explains in words beside the gross. It is NOT a deduction line: the
   * gross is the monthly CTC less this amount, so subtracting it again would
   * count it twice.
   */
  attendanceShortfall: number;
  paid: boolean;
  salaryGiven: number | null;
  remarks: string | null;
}

export interface SalarySlipIncentiveRecord {
  id: string;
  typeLabel: string;
  prospect: string;
  introducer: string;
  productCodes: string[];
  productNames: string[];
  date: string | null;
  status: string;
}

export interface SalarySlipIncentiveLine {
  entryId: string;
  incentiveName: string;
  earned: number;
  paid: number;
  adjustment: number;
  payable: number;
  state: string;
  paidDate: string | null;
}

export interface SalarySlipIncentive {
  /** What is owed and paid, from the Accounts ledger — the money truth. */
  lines: SalarySlipIncentiveLine[];
  totals: {
    earned: number;
    paid: number;
    payable: number;
    adjustment: number;
  };
  /**
   * The SAME ledger rows and request records, grouped by month — so the
   * statement's other windows (Last 3 Months, Year To Date) print rows this
   * person already has rather than re-querying for them.
   */
  linesByMonth: Record<string, SalarySlipIncentiveLine[]>;
  /** What was submitted, month by month, from the request records — the names. */
  recordsByMonth: Record<string, SalarySlipIncentiveRecord[]>;
  /** This month / last 3 months / FY-to-date target-vs-paid for this person. */
  targetVsPaid: IncentiveTargetVsPaidForPerson;
  /** The months each window covers, oldest first. FY start (April) for YTD. */
  windows: { thisMonth: string[]; last3: string[]; ytd: string[] };
}

export interface SalarySlipData {
  identity: SalarySlipIdentity;
  /** Null when the engine has no month for this person (nothing to print). */
  month: MySalaryMonth | null;
  salary: SalarySlipSalary | null;
  /** The day-by-day / week-by-week attribution. Null when the engine refuses. */
  ledger: DayLedger | null;
  attendance: {
    present: number;
    halfDay: number;
    absent: number;
    weeklyOff: number;
    holiday: number;
    paidLeave: number;
    unpaidLeave: number;
    workedHours: number | null;
    targetHours: number | null;
    payableDays: number;
  };
  incentive: SalarySlipIncentive;
  reimbursement: ReimbursementEarnings;
  retention: { amount: number; paidThisMonth: boolean; paidDate: string | null } | null;
  /** Salary net + incentive paid + reimbursement paid + retention paid. */
  totalEarnings: number;
}

/** "2026-08-14" in IST for a stored timestamp. */
function istYmd(d: Date): string {
  return localDateString("Asia/Kolkata", d);
}

/** The request's own incentive date, else the day it was filed — as the list reads it. */
function requestDate(r: IncentiveRequestRow): string | null {
  const d = r.details?.[INCENTIVE_DATE_KEY];
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : istYmd(r.createdAt);
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function loadIdentity(
  employeeId: string,
  month: string,
): Promise<SalarySlipIdentity> {
  const [row] = await db
    .select({
      id: employees.id,
      name: employees.name,
      code: employees.employeeCode,
      designation: designations.name,
      fn: functions.name,
      entity: payingEntities.name,
      workerType: employees.workerType,
      joinedAt: employees.joinedAt,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(functions, eq(employees.departmentId, functions.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return {
    employeeId,
    name: row?.name ?? "Employee",
    code: row?.code ?? null,
    designation: row?.designation ?? null,
    fn: row?.fn ?? null,
    entity: row?.entity ?? null,
    workerType: row?.workerType ?? null,
    doj: row?.joinedAt ? istYmd(row.joinedAt) : null,
    month,
    monthLabel: periodMonthLabel(month),
    fy: fyForMonth(month),
    daysInMonth: 0,
  };
}

/**
 * The earnings and deductions LINES — named from the fields the engine already
 * produced, never re-derived. A line appears only when it has a value, so a
 * person with no overtime never sees an "Overtime ₹0" row claiming they earned
 * none of something.
 */
function buildSalary(month: MySalaryMonth, ledger: DayLedger | null): SalarySlipSalary {
  const earnings: SalarySlipEarningsLine[] = [];
  earnings.push({ label: "Attendance-based Salary", amount: round2(month.baseAmount) });
  if (month.overtimeAmount > 0) {
    earnings.push({ label: "Overtime / Additional Pay", amount: round2(month.overtimeAmount) });
  }

  // THE LINES MUST CLOSE ON THE NET, and the engine's own rule is
  //   net = gross − pt − tds − advances + pendingBalanceIn  (lib/salary/compute.ts)
  // so the pending balance is an ADDITION when positive and a deduction when
  // negative. The attendance shortfall is NOT a line at all: `gross` is already
  // net of it (it is the monthly CTC less the shortfall), and subtracting it a
  // second time is exactly how a slip comes to disagree with the payslip.
  const additions: SalarySlipEarningsLine[] = [];
  if (month.previousPending > 0) {
    additions.push({ label: "Previous Pending", amount: round2(month.previousPending) });
  }

  const deductions: SalarySlipDeductionLine[] = [];
  if (month.pt > 0) deductions.push({ label: "Professional Tax", amount: round2(month.pt) });
  if (month.tds > 0) deductions.push({ label: "TDS", amount: round2(month.tds) });
  if (month.advance > 0) deductions.push({ label: "Advance", amount: round2(month.advance) });
  if (month.previousPending < 0) {
    deductions.push({ label: "Previous Pending", amount: round2(-month.previousPending) });
  }

  const additionTotal = round2(additions.reduce((s, a) => s + a.amount, 0));
  const deductionTotal = round2(deductions.reduce((s, d) => s + d.amount, 0));

  return {
    monthlyCtc: round2(month.monthlyCtc),
    // ₹/day is the engine's own rate for a day-priced month; the ledger carries
    // it when there is one. Otherwise it is the CTC over the calendar month,
    // which is exactly how the engine derives it.
    perDay: round2(ledger?.dailyRate ?? (month.daysInMonth > 0 ? month.monthlyCtc / month.daysInMonth : 0)),
    payableDays: month.finalWorkingDays,
    earnings,
    gross: round2(month.gross),
    additions,
    additionTotal,
    deductions,
    deductionTotal,
    net: round2(month.finalPayment),
    attendanceShortfall: round2(month.attendanceDeduction),
    paid: month.paid,
    salaryGiven: month.salaryGiven,
    remarks: month.remarks,
  };
}

export async function loadSalarySlipData(
  employeeId: string,
  month: string,
): Promise<SalarySlipData> {
  // ONE read of the employee row: the identity fields AND the worker type the
  // pay engine keys off, so the header and the money cannot describe two
  // different people.
  const identity = await loadIdentity(employeeId, month);

  // ── SALARY + ATTENDANCE, from the My Salary engine ────────────────────
  const months = await loadMySalaryMonths(employeeId, identity.workerType, new Date(), {
    ledgerMonths: [month],
  });
  const monthRow = months.find((m) => m.month === month) ?? null;
  const ledger = monthRow?.ledger ?? null;

  const salary = monthRow ? buildSalary(monthRow, ledger) : null;

  // ── INCENTIVE ─────────────────────────────────────────────────────────
  const [accounts, targetVsPaid, codes, requests] = await Promise.all([
    getIncentiveAccountsLedger(
      { all: false, employeeIds: new Set([employeeId]), viewerId: employeeId, label: "Slip" },
      { year: Number(month.slice(0, 4)) },
    ).catch(() => null),
    getIncentiveTargetVsPaidForPerson({ id: employeeId, name: identity.name }, month).catch(() => null),
    listActiveProductCodes().catch((): Record<string, string> => ({})),
    listIncentiveRequests({
      employeeId,
      isAdmin: false,
      canReview: false,
      // Their OWN requests only — the ceiling is the module's own rule, not a
      // second one invented here.
      visibleEmployeeIds: new Set([employeeId]),
    }).catch((): IncentiveRequestRow[] => []),
  ]);

  const monthLines = (accounts?.rows ?? []).filter(
    (r) => (r.periodMonth ?? "").slice(0, 7) === month,
  );

  const toLine = (r: (typeof monthLines)[number]): SalarySlipIncentiveLine => ({
    entryId: r.entryId,
    incentiveName: r.incentiveName,
    earned: round2(r.due),
    paid: round2(r.paid),
    adjustment: round2(r.reversal),
    payable: round2(r.finalPayable),
    state: r.status,
    paidDate: r.paidDate,
  });

  const lines: SalarySlipIncentiveLine[] = monthLines.map(toLine);

  // The same two reads, grouped by month. A row the ledger has already priced
  // is not re-priced for another window — the windows select rows.
  const linesByMonth: Record<string, SalarySlipIncentiveLine[]> = {};
  for (const r of accounts?.rows ?? []) {
    const key = (r.periodMonth ?? "").slice(0, 7);
    if (!key) continue;
    (linesByMonth[key] ??= []).push(toLine(r));
  }

  const recordsByMonth: Record<string, SalarySlipIncentiveRecord[]> = {};
  for (const r of requests) {
    const key = (requestDate(r) ?? "").slice(0, 7);
    if (!key) continue;
    (recordsByMonth[key] ??= []).push({
      id: r.id,
      typeLabel: INCENTIVE_TYPE_LABELS[r.type] ?? r.type,
      prospect: requestProspectName(r),
      introducer: requestIntroducerName(r),
      productCodes: requestProductCodes(r, codes),
      productNames: requestProductNames(r),
      date: requestDate(r),
      status: r.status,
    });
  }

  const totals = {
    earned: round2(monthLines.reduce((s, r) => s + r.due, 0)),
    paid: round2(monthLines.reduce((s, r) => s + r.paid, 0)),
    payable: round2(monthLines.reduce((s, r) => s + r.finalPayable, 0)),
    adjustment: round2(monthLines.reduce((s, r) => s + r.reversal, 0)),
  };

  // ── REIMBURSEMENT + RETENTION ─────────────────────────────────────────
  const [reimbursement, retention] = await Promise.all([
    getReimbursementsForMonth(employeeId, month),
    getRetentionBonus(employeeId).catch(() => null),
  ]);

  const retentionPaidThisMonth =
    retention != null &&
    retention.paid &&
    retention.paidDate != null &&
    retention.paidDate.slice(0, 7) === month;

  // ── THE ONE TOTAL. Its four parts are read, not computed: the month's net
  // from the engine, the incentive PAID from the ledger, the reimbursement PAID
  // from the module, the retention when it landed in this month.
  const totalEarnings = round2(
    (salary?.net ?? 0) +
      totals.paid +
      reimbursement.paidThisMonth +
      (retentionPaidThisMonth ? num(retention?.amount) : 0),
  );

  const attendance = {
    present: monthRow?.present ?? 0,
    halfDay: monthRow?.halfDay ?? 0,
    absent: monthRow?.absent ?? 0,
    weeklyOff: ledger?.totals.counts.weekly_off ?? 0,
    holiday: (ledger?.totals.counts.holiday ?? 0) + (ledger?.totals.counts.holiday_worked ?? 0) +
      (ledger?.totals.counts.holiday_half ?? 0),
    paidLeave: ledger?.totals.counts.paid_leave ?? 0,
    unpaidLeave: ledger?.totals.counts.unpaid_leave ?? 0,
    workedHours: monthRow?.workedHours ?? (ledger ? round2(ledger.totals.workedMinutes / 60) : null),
    targetHours: monthRow?.targetHours ?? (ledger ? round2(ledger.engine.targetMinutes / 60) : null),
    payableDays: monthRow?.finalWorkingDays ?? 0,
  };

  return {
    identity: { ...identity, daysInMonth: monthRow?.daysInMonth ?? 0 },
    month: monthRow,
    salary,
    ledger,
    attendance,
    incentive: {
      lines,
      linesByMonth,
      recordsByMonth,
      windows: {
        thisMonth: [month],
        last3: lastNMonths(month, 3),
        // Financial-year to date, the same window `targetVsPaid.ytd` uses — so
        // the rows under it and the attainment above it cover one period.
        ytd: ytdMonths(month),
      },
      totals,
      targetVsPaid:
        targetVsPaid ?? {
          month,
          thisMonth: { target: 0, paid: 0, attainmentPct: null },
          last3Months: { target: 0, paid: 0, attainmentPct: null },
          ytd: { target: 0, paid: 0, attainmentPct: null },
          perMonth: [],
        },
    },
    reimbursement,
    retention: retention
      ? {
          amount: num(retention.amount),
          paidThisMonth: retentionPaidThisMonth,
          paidDate: retention.paidDate,
        }
      : null,
    totalEarnings,
  };
}
