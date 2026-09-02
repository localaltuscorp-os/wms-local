import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees } from "@/db/schema";

export interface PunchDetail {
  at: Date;
  note: string | null;
  /** How the person was verified at punch time (0054). */
  verifyMethod: "biometric" | "gps_only" | "none";
  /** Metres from the office anchor, when a geofence was active. */
  distanceM: number | null;
}

export interface DayPunches {
  date: string; // YYYY-MM-DD
  in: PunchDetail | null;
  out: PunchDetail | null;
}

interface RawPunch {
  logDate: string;
  kind: "in" | "out";
  loggedAt: Date;
  note: string | null;
  verifyMethod: "biometric" | "gps_only" | "none";
  distanceM: number | null;
}

/** Fold raw punch rows into one row per day (newest first). */
function foldByDay(rows: RawPunch[]): DayPunches[] {
  const byDay = new Map<string, DayPunches>();
  for (const r of rows) {
    let day = byDay.get(r.logDate);
    if (!day) {
      day = { date: r.logDate, in: null, out: null };
      byDay.set(r.logDate, day);
    }
    day[r.kind] = {
      at: r.loggedAt,
      note: r.note,
      verifyMethod: r.verifyMethod,
      distanceM: r.distanceM,
    };
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** My punches for the last `days` calendar days (employee timezone dates). */
export async function listMyAttendance(
  employeeId: string,
  sinceDate: string,
): Promise<DayPunches[]> {
  const rows = await db
    .select({
      logDate: attendanceLogs.logDate,
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
      note: attendanceLogs.note,
      verifyMethod: attendanceLogs.verifyMethod,
      distanceM: attendanceLogs.distanceM,
    })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        gte(attendanceLogs.logDate, sinceDate),
      ),
    )
    .orderBy(desc(attendanceLogs.logDate));
  return foldByDay(rows);
}

/**
 * Has this employee already clocked IN on `ymd`?
 *
 * Used by the Attendance page lock as proof the day was legitimately started.
 * A check-in row can only exist if the clock-in gate passed (Start My Day +
 * MIN_ATTENDANCE_ITEMS), so it is a durable record of that — unlike
 * `daily_plan_day.started_at`, which `reopenPlan` sets back to NULL.
 *
 * That distinction is the whole point: re-opening your plan to change tasks
 * mid-day must NOT take the attendance page away from someone already clocked
 * in, or they cannot reach the button to clock out. Clocking OUT still requires
 * "Finish Day" — this only governs whether the page opens.
 */
export async function hasCheckedInOn(employeeId: string, ymd: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        eq(attendanceLogs.logDate, ymd),
        eq(attendanceLogs.kind, "in"),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Sibling of {@link hasCheckedInOn} for the check-OUT row: has this employee
 * already clocked out on `ymd`?
 *
 * Used by the close-out gate in `punchAttendance` to answer "is there anything
 * left to gate?". Someone who is already checked out has nothing to finish and
 * must NOT be bounced to the planner again — the duplicate punch is refused
 * downstream with a plain "You already checked out today.", which is the honest
 * message for that state. Read-only; callers fail-open.
 */
export async function hasCheckedOutOn(employeeId: string, ymd: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        eq(attendanceLogs.logDate, ymd),
        eq(attendanceLogs.kind, "out"),
      ),
    )
    .limit(1);
  return !!row;
}

export interface TeamAttendanceRow {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  in: PunchDetail | null;
  out: PunchDetail | null;
}

/**
 * Admin day view: every active employee with their punches for `date`
 * (YYYY-MM-DD). Employees without a punch still appear (absent).
 */
export async function listTeamAttendanceForDate(
  date: string,
): Promise<TeamAttendanceRow[]> {
  const [people, punches] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        avatarUrl: employees.avatarUrl,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(employees.name),
    db
      .select({
        employeeId: attendanceLogs.employeeId,
        kind: attendanceLogs.kind,
        loggedAt: attendanceLogs.loggedAt,
        note: attendanceLogs.note,
        verifyMethod: attendanceLogs.verifyMethod,
        distanceM: attendanceLogs.distanceM,
      })
      .from(attendanceLogs)
      .where(eq(attendanceLogs.logDate, date)),
  ]);

  const byEmployee = new Map<
    string,
    { in: TeamAttendanceRow["in"]; out: TeamAttendanceRow["out"] }
  >();
  for (const p of punches) {
    let slot = byEmployee.get(p.employeeId);
    if (!slot) {
      slot = { in: null, out: null };
      byEmployee.set(p.employeeId, slot);
    }
    slot[p.kind] = {
      at: p.loggedAt,
      note: p.note,
      verifyMethod: p.verifyMethod,
      distanceM: p.distanceM,
    };
  }

  return people
    .map((e) => ({
      employeeId: e.id,
      name: e.name,
      avatarUrl: e.avatarUrl,
      in: byEmployee.get(e.id)?.in ?? null,
      out: byEmployee.get(e.id)?.out ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
