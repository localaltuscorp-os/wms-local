import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceSheetMonth, employees } from "@/db/schema";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import type { DashboardRow, MonthSummary } from "@/lib/queries/attendance-status";

/**
 * SHEET-BACKED month report — the same DashboardRow[] shape the Attendance
 * report table renders, but sourced from the synced HR "Attendance log" sheet
 * (attendance_sheet_month) instead of the punch grading. One row per employee
 * present in the sheet for that month (so historical / ex-employees show too).
 *
 * Punch-only summary fields (late, incomplete, worked minutes, leave, comp-off)
 * are 0 — the sheet doesn't carry them. `payableDays` = the sheet's
 * "Total No Days Worked". Numeric columns arrive as strings; coerced here.
 */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function getMonthDashboardFromSheet(year: number, month: number): Promise<DashboardRow[]> {
  const bucket = `${year}-${String(month).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      rowId: attendanceSheetMonth.id,
      employeeId: attendanceSheetMonth.employeeId,
      sheetName: attendanceSheetMonth.employeeName,
      sheetDesignation: attendanceSheetMonth.designation,
      present: attendanceSheetMonth.present,
      holiday: attendanceSheetMonth.holiday,
      weeklyOff: attendanceSheetMonth.weeklyOff,
      pohFull: attendanceSheetMonth.pohFull,
      pohHalf: attendanceSheetMonth.pohHalf,
      halfDay: attendanceSheetMonth.halfDay,
      absent: attendanceSheetMonth.absent,
      totalDaysWorked: attendanceSheetMonth.totalDaysWorked,
      empName: employees.name,
      empDept: employees.department,
      empMgr: employees.managerId,
    })
    .from(attendanceSheetMonth)
    .leftJoin(employees, eq(employees.id, attendanceSheetMonth.employeeId))
    .where(eq(attendanceSheetMonth.month, bucket));

  return rows
    .map((r): DashboardRow => {
      const summary: MonthSummary = {
        payableDays: n(r.totalDaysWorked),
        present: n(r.present),
        absent: n(r.absent),
        halfDay: n(r.halfDay),
        weeklyOff: n(r.weeklyOff),
        incomplete: 0,
        late: 0,
        lateRaw: 0,
        leftEarly: 0,
        lateWaived: 0,
        holiday: n(r.holiday),
        holidayPresent: n(r.pohFull),
        holidayHalfDay: n(r.pohHalf),
        paidLeave: 0,
        unpaidLeave: 0,
        compOff: 0,
        totalWorkedMinutes: 0,
      };
      return {
        // Matched employee id when the sync resolved the name; else the sheet
        // row id as a stable, unique table key.
        employeeId: r.employeeId ?? r.rowId,
        // The SHEET's own name — so the daily view can look days up by name.
        name: r.sheetName,
        designation: r.sheetDesignation,
        department: r.empDept ?? null,
        managerId: r.empMgr ?? null,
        summary,
        source: "sheet" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * MERGED month report for the transition period (months that have a synced HR
 * sheet, e.g. July 2026). Combines:
 *   • the frozen SHEET summary for every employee ON the sheet — counts locked,
 *     source "sheet" (their drill-down shows sheet statuses + real punch times),
 *   • PLUS app-native rows (graded from real punches) for everyone ELSE — chiefly
 *     mid-month joiners not on the full-month sheet — source "app".
 * This keeps historical counts exactly as-is while ensuring nobody who was
 * actually present that month is missing from the report.
 */
export async function getMonthDashboardMerged(
  year: number,
  month: number,
  refTodayISO: string,
): Promise<DashboardRow[]> {
  const bucket = `${year}-${String(month).padStart(2, "0")}-01`;
  const [appRows, sheetRows] = await Promise.all([
    getMonthDashboard(year, month, refTodayISO),
    db
      .select({
        rowId: attendanceSheetMonth.id,
        employeeId: attendanceSheetMonth.employeeId,
        sheetName: attendanceSheetMonth.employeeName,
        sheetDesignation: attendanceSheetMonth.designation,
        present: attendanceSheetMonth.present,
        holiday: attendanceSheetMonth.holiday,
        weeklyOff: attendanceSheetMonth.weeklyOff,
        pohFull: attendanceSheetMonth.pohFull,
        pohHalf: attendanceSheetMonth.pohHalf,
        halfDay: attendanceSheetMonth.halfDay,
        absent: attendanceSheetMonth.absent,
        totalDaysWorked: attendanceSheetMonth.totalDaysWorked,
      })
      .from(attendanceSheetMonth)
      .where(eq(attendanceSheetMonth.month, bucket)),
  ]);

  const sheetSummaryOf = (r: (typeof sheetRows)[number]): MonthSummary => ({
    payableDays: n(r.totalDaysWorked),
    present: n(r.present),
    absent: n(r.absent),
    halfDay: n(r.halfDay),
    weeklyOff: n(r.weeklyOff),
    incomplete: 0,
    late: 0,
    lateRaw: 0,
    leftEarly: 0,
    lateWaived: 0,
    holiday: n(r.holiday),
    holidayPresent: n(r.pohFull),
    holidayHalfDay: n(r.pohHalf),
    paidLeave: 0,
    unpaidLeave: 0,
    compOff: 0,
    totalWorkedMinutes: 0,
  });

  // Index sheet rows by their matched employee id (rows the sync resolved).
  const sheetByEmp = new Map<string, (typeof sheetRows)[number]>();
  const unmatched: (typeof sheetRows)[number][] = [];
  for (const s of sheetRows) {
    if (s.employeeId) sheetByEmp.set(s.employeeId, s);
    else unmatched.push(s);
  }

  const out: DashboardRow[] = [];
  // Everyone active in the app shows up. Where a sheet row exists for them, the
  // sheet's LOCKED counts win (source "sheet"); otherwise their real graded
  // punches (source "app") — this is how mid-month joiners appear.
  for (const a of appRows) {
    const s = sheetByEmp.get(a.employeeId);
    if (s) {
      sheetByEmp.delete(a.employeeId);
      out.push({ ...a, name: s.sheetName, designation: s.sheetDesignation ?? a.designation, summary: sheetSummaryOf(s), source: "sheet" });
    } else {
      out.push({ ...a, source: "app" });
    }
  }
  // Sheet people not in the active roster (matched-but-inactive, or ex-employees
  // whose name never resolved) — keep them as frozen sheet rows.
  for (const s of [...sheetByEmp.values(), ...unmatched]) {
    out.push({
      employeeId: s.employeeId ?? s.rowId,
      name: s.sheetName,
      designation: s.sheetDesignation,
      department: null,
      managerId: null,
      summary: sheetSummaryOf(s),
      source: "sheet",
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
