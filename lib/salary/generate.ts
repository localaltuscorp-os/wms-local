import "server-only";
import type { SalaryInput } from "@/lib/salary/compute";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";
import {
  listSalaryProfiles,
  sumAdvances,
  lastDisbursedRemainder,
} from "@/lib/queries/salary";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";

export interface MonthInputRow {
  employeeId: string;
  name: string;
  fy: string;
  month: string; // YYYY-MM
  daysInMonth: number;
  annualCtc: number;
  hasProfile: boolean; // false → no CTC set; caller flags "attendance-only"
  input: SalaryInput; // ready for computeSalary
}

/** Assemble per-employee salary-compute inputs for a YYYY-MM month from the
 *  attendance summary + each employee's profile + advances + carry-forward.
 *  DB reads only — no writes. */
export async function assembleMonthInputs(month: string): Promise<MonthInputRow[]> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const refTodayISO = localDateString("Asia/Kolkata");
  const dim = daysInMonth(month);
  const fy = fyForMonth(month);

  const [dashboard, profiles] = await Promise.all([
    getMonthDashboard(y, m, refTodayISO),
    listSalaryProfiles(),
  ]);
  // index attendance summary by employeeId
  const summaryByEmp = new Map(dashboard.map((r) => [r.employeeId, r.summary]));

  const rows: MonthInputRow[] = [];
  for (const p of profiles) {
    const summary = summaryByEmp.get(p.employeeId);
    const payableDays = summary?.payableDays ?? 0;
    const lateMarks = summary?.late ?? 0;
    const [advances, pendingBalanceIn] = await Promise.all([
      sumAdvances(p.employeeId, month),
      lastDisbursedRemainder(p.employeeId, month),
    ]);
    rows.push({
      employeeId: p.employeeId,
      name: p.name,
      fy,
      month,
      daysInMonth: dim,
      annualCtc: p.annualCtc,
      hasProfile: p.annualCtc > 0,
      input: {
        annualCtc: p.annualCtc,
        payableDays,
        daysInMonth: dim,
        ptExempt: p.ptExempt,
        tdsMonthly: p.tdsMonthly,
        lateMarksInMonth: lateMarks,
        advances,
        pendingBalanceIn,
      },
    });
  }
  return rows;
}
