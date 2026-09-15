import "server-only";

import { and, eq, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceAuditLog, employees } from "@/db/schema";
import type { AttendanceAuditAction, AttendanceAuthorizationContext } from "@/db/enums";
import type { AttendanceAuthorized } from "@/lib/security/attendance-authorization";

/**
 * THE IMMUTABLE ATTENDANCE AUDIT TRAIL.
 *
 * Every privileged attendance change writes one row here, and nothing in this
 * repository ever updates or deletes one. That is not merely a convention:
 * migration 0215 installs BEFORE UPDATE / DELETE / TRUNCATE triggers on
 * `attendance_audit_log` that raise unconditionally, for every role including
 * the database owner the application connects as. An UPDATE issued from
 * application code — by anyone, including the two privileged managers — fails at
 * the database. This module exposes no mutation function at all, so there is no
 * path to try it from.
 *
 * ── WHY THE WRITE IS BEST-EFFORT, AND WHY THAT IS SAFE ─────────────────────
 * `recordAttendanceAudit` swallows its own errors, matching the existing
 * `auditPunch` helper. A failed audit write must not roll back a completed
 * attendance correction and leave the employee's record wrong; the failure is
 * logged loudly instead. The stronger alternative — one transaction covering the
 * punch and its audit row — is the right eventual shape, and is called out in
 * the security notes rather than half-done here: the existing punch writes are
 * spread across three files and are not transactional today, so making only the
 * audit path transactional would give a false impression of a guarantee the
 * surrounding code does not provide.
 */

export interface AttendanceAuditEntry {
  /** The punch row, when it still exists. Null for a delete. */
  attendanceLogId?: string | null;
  /** WHOSE attendance changed. */
  employeeId: string;
  /** WHO changed it. */
  actorId: string;
  action: AttendanceAuditAction;
  /** The day whose attendance changed, "YYYY-MM-DD". */
  attendanceDate: string;
  punchKind?: "in" | "out" | null;
  /** Human-readable, e.g. "18:02". Null when there was nothing before. */
  oldValue?: string | null;
  /** Human-readable, e.g. "18:27". Null for a delete/clear. */
  newValue?: string | null;
  reason?: string | null;
  /** The authorization decision, straight from `authorizeAttendanceMutation`. */
  authorization: AttendanceAuthorized;
}

/** `field`, derived rather than passed: one fewer thing a caller can get wrong. */
function fieldFor(kind: "in" | "out" | null | undefined): string {
  return kind === "in" ? "check_in" : kind === "out" ? "check_out" : "punch";
}

/**
 * Append one audit record. Never throws.
 *
 * Call AFTER the attendance write succeeds, so the trail records what actually
 * happened rather than what was attempted — a refused change is refused by the
 * authorization service and never reaches here.
 */
export async function recordAttendanceAudit(entry: AttendanceAuditEntry): Promise<void> {
  try {
    await db.insert(attendanceAuditLog).values({
      attendanceLogId: entry.attendanceLogId ?? null,
      employeeId: entry.employeeId,
      actorId: entry.actorId,
      action: entry.action,
      field: fieldFor(entry.punchKind),
      attendanceDate: entry.attendanceDate,
      punchKind: entry.punchKind ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      reason: entry.reason ?? null,
      deviceRowId: entry.authorization.deviceRowId,
      deviceLabel: entry.authorization.deviceLabel,
      deviceKind: entry.authorization.context.deviceKind,
      authorizationContext: entry.authorization.context,
    });
  } catch (err) {
    // LOUDLY. A missing audit row is a security-relevant event in its own right
    // — it means a privileged change happened with no trail — so it must be
    // findable in the logs even though it cannot be allowed to fail the request.
    console.error("[attendance-audit] FAILED to write audit record", {
      employeeId: entry.employeeId,
      actorId: entry.actorId,
      action: entry.action,
      attendanceDate: entry.attendanceDate,
      err,
    });
  }
}

/* ── Reading the trail (the Attendance Change Log screen) ─────────────────── */

export interface AttendanceAuditFilters {
  /** Whose attendance. */
  employeeId?: string;
  /** Who made the change. */
  actorId?: string;
  /** The attendance DATE range — the days whose attendance was changed. */
  attendanceFrom?: string;
  attendanceTo?: string;
  /** The CHANGE date range — when the edit was made. Deliberately separate:
   *  "what changed about September" and "what did we change last Tuesday" are
   *  different investigations. */
  changedFrom?: string;
  changedTo?: string;
  action?: AttendanceAuditAction;
  limit?: number;
}

export interface AttendanceAuditView {
  id: string;
  employeeId: string;
  employeeName: string;
  actorId: string;
  actorName: string;
  action: AttendanceAuditAction;
  field: string | null;
  attendanceDate: string;
  punchKind: "in" | "out" | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  deviceLabel: string | null;
  deviceKind: string | null;
  authorizationContext: AttendanceAuthorizationContext | null;
  createdAt: Date;
}

/**
 * The change log, newest first.
 *
 * Capped at 500 rows by default and never unbounded: this table only grows, and
 * a screen that tries to render every privileged change ever made stops working
 * quietly a year from now. The filters are how you narrow it.
 */
export async function listAttendanceAudit(
  filters: AttendanceAuditFilters = {},
): Promise<AttendanceAuditView[]> {
  const actor = employees;
  const subject = sql`subject`;

  const where: SQL[] = [];
  if (filters.employeeId) where.push(eq(attendanceAuditLog.employeeId, filters.employeeId));
  if (filters.actorId) where.push(eq(attendanceAuditLog.actorId, filters.actorId));
  if (filters.action) where.push(eq(attendanceAuditLog.action, filters.action));
  if (filters.attendanceFrom)
    where.push(gte(attendanceAuditLog.attendanceDate, filters.attendanceFrom));
  if (filters.attendanceTo)
    where.push(lte(attendanceAuditLog.attendanceDate, filters.attendanceTo));
  // The change-date bounds are inclusive DAYS, so the upper bound has to reach
  // the end of that day rather than its midnight — otherwise "to: today" finds
  // nothing that happened today.
  if (filters.changedFrom)
    where.push(gte(attendanceAuditLog.createdAt, new Date(`${filters.changedFrom}T00:00:00.000Z`)));
  if (filters.changedTo)
    where.push(lte(attendanceAuditLog.createdAt, new Date(`${filters.changedTo}T23:59:59.999Z`)));

  const rows = await db
    .select({
      id: attendanceAuditLog.id,
      employeeId: attendanceAuditLog.employeeId,
      employeeName: sql<string>`${subject}.name`,
      actorId: attendanceAuditLog.actorId,
      actorName: actor.name,
      action: attendanceAuditLog.action,
      field: attendanceAuditLog.field,
      attendanceDate: attendanceAuditLog.attendanceDate,
      punchKind: attendanceAuditLog.punchKind,
      oldValue: attendanceAuditLog.oldValue,
      newValue: attendanceAuditLog.newValue,
      reason: attendanceAuditLog.reason,
      deviceLabel: attendanceAuditLog.deviceLabel,
      deviceKind: attendanceAuditLog.deviceKind,
      authorizationContext: attendanceAuditLog.authorizationContext,
      createdAt: attendanceAuditLog.createdAt,
    })
    .from(attendanceAuditLog)
    // Two joins onto `employees` — the subject and the actor are both people and
    // the log has to name both. The subject side is aliased in raw SQL because
    // Drizzle's select builder needs distinct table references for a self-join.
    .leftJoin(sql`employees as subject`, sql`subject.id = ${attendanceAuditLog.employeeId}`)
    .leftJoin(actor, eq(actor.id, attendanceAuditLog.actorId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(attendanceAuditLog.createdAt))
    .limit(Math.min(filters.limit ?? 500, 1000));

  return rows.map((r) => ({
    ...r,
    employeeName: r.employeeName ?? "—",
    actorName: r.actorName ?? "—",
  }));
}

/** The people who appear in the log, for the filter dropdowns. Two short
 *  lists rather than the whole roster: a filter offering 300 names nobody has
 *  ever edited is noise. */
export async function attendanceAuditParticipants(): Promise<{
  subjects: { id: string; name: string }[];
  actors: { id: string; name: string }[];
}> {
  const [subjects, actors] = await Promise.all([
    db
      .selectDistinct({ id: employees.id, name: employees.name })
      .from(attendanceAuditLog)
      .innerJoin(employees, eq(employees.id, attendanceAuditLog.employeeId))
      .orderBy(employees.name),
    db
      .selectDistinct({ id: employees.id, name: employees.name })
      .from(attendanceAuditLog)
      .innerJoin(employees, eq(employees.id, attendanceAuditLog.actorId))
      .orderBy(employees.name),
  ]);
  return { subjects, actors };
}
