import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, type NotificationKind } from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  companyDefaults,
  employeeSchedule,
  getEmployeeMonthStatus,
} from "@/lib/queries/attendance-status";
import { notifyAttendance, decideCheckoutNotification } from "@/lib/attendance/notify";
import { toMin, lateDeductionCrossed } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";

/**
 * Attendance punch notifications — extracted from the web Server Action so the
 * native punch API fires the EXACT same alerts (late heads-up, the every-3rd-late
 * ½-day salary-deduction trigger, and the check-out half-day / late-waived
 * emails). This logic touches payroll, so a single source is essential. All
 * functions are best-effort: a notify failure never blocks the punch.
 */

type ScheduleEmp = { attLateAfter: string | null; attEarlyBefore: string | null };
type NotifyEmp = ScheduleEmp & { id: string };
type DayEmp = NotifyEmp & { timezone: string };

/** Format an instant as "HH:mm" in the given IANA timezone (24-hour). */
export function clockInTz(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/** Resolve an employee's effective attendance schedule (org defaults + their
 *  per-employee lateAfter/earlyBefore overrides). */
async function resolveScheduleFor(emp: ScheduleEmp): Promise<AttendanceSchedule> {
  const org = await getOrgSettings();
  return employeeSchedule(emp, companyDefaults(org));
}

/** Read an employee's folded in/out "HH:mm" (in `tz`) for one log day. */
async function readDayTimes(
  employeeId: string,
  logDate: string,
  tz: string,
): Promise<{ inAt: string | null; outAt: string | null }> {
  const rows = await db
    .select({ kind: attendanceLogs.kind, loggedAt: attendanceLogs.loggedAt })
    .from(attendanceLogs)
    .where(
      and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.logDate, logDate)),
    );
  let inAt: string | null = null;
  let outAt: string | null = null;
  for (const r of rows) {
    const t = clockInTz(r.loggedAt, tz);
    if (r.kind === "in") inAt = t;
    else outAt = t;
  }
  return { inAt, outAt };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Decide + fire the right attendance email for a SELF check-in. A late arrival
 * gets the `attendance_late` heads-up immediately (the waiver, if any, comes
 * later on check-out). Best-effort.
 */
export async function notifyOnInPunch(
  emp: NotifyEmp,
  logDate: string,
  inAt: string,
): Promise<void> {
  try {
    const sched = await resolveScheduleFor(emp);
    if (toMin(inAt) <= toMin(sched.lateAfter)) return; // on-time — nothing to do.
    await notifyAttendance("attendance_late", emp, { logDate, inAt });
    await maybeFireDeductionAlert(emp, logDate, inAt);
  } catch (err) {
    console.warn("[attendance] notifyOnInPunch failed (non-fatal)", err);
  }
}

/**
 * B8 deduction trigger (self + admin). Re-grades the month and fires the
 * `attendance_late_deduction` alert when the employee's UN-WAIVED late count
 * lands exactly on a multiple of 3 (every 3rd late → a ½-day salary deduction).
 */
async function maybeFireDeductionAlert(
  emp: NotifyEmp,
  logDate: string,
  inAt: string,
): Promise<void> {
  const year = Number(logDate.slice(0, 4));
  const month = Number(logDate.slice(5, 7));
  const status = await getEmployeeMonthStatus(emp.id, year, month, logDate);
  const now = status.summary.late;
  const prev = now - 1;
  if (lateDeductionCrossed(prev, now)) {
    await notifyAttendance("attendance_late_deduction", emp, {
      logDate,
      inAt,
      lateCount: now,
      monthLabel: `${MONTH_NAMES[month - 1] ?? ""} ${year}`.trim(),
    });
  }
}

/**
 * Decide + fire the right attendance email when a day's OUT is finalized (self
 * check-out, or an admin edit/upsert that completes the day). Re-reads both
 * punches so the decision matches the graded day. Best-effort.
 */
export async function notifyOnDayFinalized(emp: DayEmp, logDate: string): Promise<void> {
  try {
    const tz = emp.timezone || "Asia/Kolkata";
    const { inAt, outAt } = await readDayTimes(emp.id, logDate, tz);
    if (!inAt || !outAt) return;
    const sched = await resolveScheduleFor(emp);
    const kind = decideCheckoutNotification({ inAt, outAt, sched });
    if (!kind) return;
    const worked = Math.max(0, toMin(outAt) - toMin(inAt));
    await notifyAttendance(kind, emp, { logDate, inAt, outAt, workedMinutes: worked });
  } catch (err) {
    console.warn("[attendance] notifyOnDayFinalized failed (non-fatal)", err);
  }
}

/**
 * Admin-side B8 trigger. After an admin upsert/edit, re-read the day's in-time;
 * if it grades late, run the same deduction boundary check the self path does.
 * Best-effort; idempotent edits to an already-late day stay silent.
 */
export async function notifyAdminLateDeduction(emp: DayEmp, logDate: string): Promise<void> {
  try {
    const tz = emp.timezone || "Asia/Kolkata";
    const { inAt } = await readDayTimes(emp.id, logDate, tz);
    if (!inAt) return;
    const sched = await resolveScheduleFor(emp);
    if (toMin(inAt) <= toMin(sched.lateAfter)) return; // not a late day.
    await maybeFireDeductionAlert(emp, logDate, inAt);
  } catch (err) {
    console.warn("[attendance] notifyAdminLateDeduction failed (non-fatal)", err);
  }
}

/**
 * Alert admins when an employee enrolls a NEW attendance device (a WebAuthn
 * passkey on web, or a bound phone on mobile). A device registered to someone
 * else could punch on their behalf — this is the anti-proxy review hook.
 * In-app inbox only; best-effort.
 */
export async function alertAdminsNewAttendanceDevice(
  actor: { id: string; name: string },
  deviceLabel: string | null,
  deviceCount: number,
): Promise<void> {
  try {
    const admins = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.isAdmin, true), eq(employees.isActive, true)));

    const label = deviceLabel?.trim() || "a new device";
    const title =
      deviceCount > 1
        ? `${actor.name} added another attendance device`
        : `${actor.name} enrolled an attendance device`;
    const body = `${actor.name} registered ${label} for attendance punch (now ${deviceCount} device${deviceCount === 1 ? "" : "s"}). A device registered to someone else can punch on their behalf — review if this looks off.`;

    await Promise.all(
      admins
        .filter((a) => a.id !== actor.id)
        .map((a) =>
          notify({
            userId: a.id,
            kind: "attendance_device" as NotificationKind,
            title,
            body,
            actorId: actor.id,
            forceChannels: [],
          }),
        ),
    );
  } catch (err) {
    console.warn("[attendance] admin new-device alert failed (non-fatal)", err);
  }
}
