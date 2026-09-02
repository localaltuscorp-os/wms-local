import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryBreakup } from "@/db/schema";
import { assembleMonthInputs, computeForRow } from "./generate";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { getMonthDashboardMerged, getMonthDashboardFromSheet } from "@/lib/queries/attendance-sheet-report";
import { localDateString } from "@/lib/format";

/**
 * Populate the on-page `salary_breakup` rows for a month from the APP-computed
 * payroll (real `employees.name`, the attendance report's breakdown, and
 * `computeSalary` figures). This is what makes the salary page reflect the app
 * instead of the imported Excel: `generateSalary` calls it after writing the
 * canonical `salary_runs`, so one "Generate Salary" click updates both.
 *
 * ONLY the computed columns are written — the super-admin overlays (paid /
 * wave-off / adjustment / notes / sr_no) are never touched, so a regenerate
 * never wipes a recorded disbursement. Attendance source matches the report:
 * August+ = app punches, July 2026 = merged (locked sheet + app joiners),
 * earlier = frozen sheet mirror.
 */
export async function syncBreakupFromApp(month: string): Promise<number> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const today = localDateString("Asia/Kolkata");

  const dash =
    month >= "2026-08"
      ? await getMonthDashboard(y, m, today)
      : month === "2026-07"
        ? await getMonthDashboardMerged(y, m, today)
        : await getMonthDashboardFromSheet(y, m);
  const sumById = new Map(dash.map((r) => [r.employeeId, r.summary]));

  const [profiles, inputs] = await Promise.all([listSalaryProfiles(), assembleMonthInputs(month)]);
  const profById = new Map(profiles.map((p) => [p.employeeId, p]));

  const monthD = `${month}-01`;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const existing = await db
    .select({ id: salaryBreakup.id, employeeId: salaryBreakup.employeeId, name: salaryBreakup.employeeName, srNo: salaryBreakup.srNo })
    .from(salaryBreakup)
    .where(eq(salaryBreakup.month, monthD));
  // Index existing rows by employee id AND by normalized name so an UNLINKED or
  // name-drifted sheet row is updated (+ linked) in place, never duplicated.
  const byEmp = new Map<string, string>();
  const byName = new Map<string, string>();
  let maxSr = 0;
  for (const e of existing) {
    if (e.employeeId) byEmp.set(e.employeeId, e.id);
    if (!byName.has(norm(e.name))) byName.set(norm(e.name), e.id);
    maxSr = Math.max(maxSr, e.srNo ?? 0);
  }

  const f = (n: number) => n.toFixed(2);
  let n = 0;
  for (const row of inputs) {
    if (!row.hasProfile) continue; // no pay config for this basis → nothing to compute
    const b = computeForRow(row); // routes by pay basis (monthly_ctc | hourly | fixed_fee)
    const s = sumById.get(row.employeeId);
    const p = profById.get(row.employeeId);
    const computed = {
      employeeName: row.name,
      designation: p?.designationName ?? null,
      companyName: p?.payingEntityName ?? null,
      present: f(s?.present ?? 0),
      absent: f(s?.absent ?? 0),
      halfDay: f(s?.halfDay ?? 0),
      weeklyOff: f(s?.weeklyOff ?? 0),
      holiday: f(s?.holiday ?? 0),
      pohFull: f(s?.holidayPresent ?? 0),
      pohHalf: f(s?.holidayHalfDay ?? 0),
      daysInMonth: f(row.daysInMonth),
      totalDaysWorked: f(b.payableDays),
      finalWorkingDays: f(b.effectiveDays),
      annualCtc: f(row.annualCtc),
      monthlyCtc: f(b.monthlyCtc),
      payableAfterLeave: f(b.gross),
      pt: f(b.pt),
      payableAfterPt: f(b.gross - b.pt),
      advance: f(b.advances),
      previousPending: f(b.pendingBalanceIn),
      finalPayment: f(b.net),
      fy: row.fy,
      // Worker types (0177) — persist the basis + hourly figure for the payslip.
      payType: row.payBasis,
      workedHours: b.workedHours != null ? f(b.workedHours) : null,
    };
    // Match an existing row by employee id, else by normalized name — this
    // updates (and LINKS via employee_id) an unlinked or name-drifted sheet row
    // in place instead of inserting a duplicate.
    const rowId = byEmp.get(row.employeeId) ?? byName.get(norm(row.name));
    if (rowId) {
      await db
        .update(salaryBreakup)
        .set({ ...computed, employeeId: row.employeeId })
        .where(eq(salaryBreakup.id, rowId));
      byEmp.set(row.employeeId, rowId); // guard against a second name-collision insert
    } else {
      const inserted = await db
        .insert(salaryBreakup)
        .values({ employeeId: row.employeeId, month: monthD, srNo: ++maxSr, ...computed })
        .returning({ id: salaryBreakup.id });
      if (inserted[0]) {
        byEmp.set(row.employeeId, inserted[0].id);
        byName.set(norm(row.name), inserted[0].id);
      }
    }
    n++;
  }
  return n;
}
