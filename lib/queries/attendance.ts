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
