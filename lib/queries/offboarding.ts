import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dataRetentionPolicies,
  employeeExits,
  employeeEvents,
  employees,
  settingsEvents,
  taskEvents,
} from "@/db/schema";
import type { ExitReason, RehireEligibility } from "@/db/enums";

/**
 * Reads for the Previous Employees section.
 *
 * ── THE 60-DAY WINDOW IS A VIEW, NOT A DELETION ────────────────────────────
 * The requested behaviour was "his activity stays visible for about two
 * months". That is implemented HERE, as a query filter, and nowhere else.
 * Nothing purges audit rows on exit, for two reasons:
 *
 *   1. Misconduct is routinely discovered months after someone leaves. An
 *      exit-time purge of audit history is precisely the capability an insider
 *      would want, and this company lost data to exactly that pattern on
 *      2026-09-04.
 *   2. `audit_events` carries a 7-year retention basis in
 *      `data_retention_policies`. A 60-day delete would contradict the policy
 *      the same system publishes.
 *
 * So the default view is 60 days and a super-admin can lift it. The rows are
 * always there.
 */
export const ACTIVITY_WINDOW_DAYS = 60;

export interface FormerEmployeeRow {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  joinedAt: Date | null;
  lastWorkingDay: string | null;
  exitReason: ExitReason | null;
  exitReasonOther: string | null;
  rehireEligibility: RehireEligibility | null;
  legalHold: boolean;
  anonymisedAt: Date | null;
  archivedAt: Date | null;
  successorName: string | null;
}

/**
 * Every former employee, newest departure first.
 *
 * LEFT JOIN on the exit record rather than INNER: a row could reach `former`
 * without an exit record if one were ever written by hand or by a data fix,
 * and such a person disappearing from the list entirely would be worse than
 * showing them with blank exit fields.
 */
export async function listFormerEmployees(): Promise<FormerEmployeeRow[]> {
  const successor = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .as("successor");

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      department: employees.department,
      joinedAt: employees.joinedAt,
      lastWorkingDay: employees.lastWorkingDay,
      legalHold: employees.legalHold,
      anonymisedAt: employees.anonymisedAt,
      exitReason: employeeExits.exitReason,
      exitReasonOther: employeeExits.exitReasonOther,
      rehireEligibility: employeeExits.rehireEligibility,
      archivedAt: employeeExits.archivedAt,
      successorName: successor.name,
    })
    .from(employees)
    .leftJoin(employeeExits, eq(employeeExits.employeeId, employees.id))
    .leftJoin(successor, eq(successor.id, employeeExits.successorId))
    .where(inArray(employees.employmentStatus, ["former", "anonymised"]))
    .orderBy(desc(employeeExits.archivedAt));

  return rows as FormerEmployeeRow[];
}

/** The full exit record for one person, for the View more panel. */
export async function getExitRecord(employeeId: string) {
  const [row] = await db
    .select()
    .from(employeeExits)
    .where(eq(employeeExits.employeeId, employeeId))
    .limit(1);
  return row ?? null;
}

export interface ActivityEntry {
  at: Date;
  kind: "task" | "employee" | "settings";
  eventType: string;
  detail: string | null;
}

/**
 * What a former employee did, most recent first.
 *
 * `sinceDays = null` lifts the window entirely (super-admin "show full
 * history"). Any number narrows it. The rows themselves are never filtered out
 * of existence — see the note at the top of this file.
 */
export async function getFormerEmployeeActivity(
  employeeId: string,
  sinceDays: number | null = ACTIVITY_WINDOW_DAYS,
  limit = 250,
): Promise<ActivityEntry[]> {
  const cutoff =
    sinceDays === null
      ? null
      : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const taskWhere = cutoff
    ? and(eq(taskEvents.actorId, employeeId), gte(taskEvents.createdAt, cutoff))
    : eq(taskEvents.actorId, employeeId);
  const empWhere = cutoff
    ? and(eq(employeeEvents.actorId, employeeId), gte(employeeEvents.createdAt, cutoff))
    : eq(employeeEvents.actorId, employeeId);
  const setWhere = cutoff
    ? and(eq(settingsEvents.actorId, employeeId), gte(settingsEvents.createdAt, cutoff))
    : eq(settingsEvents.actorId, employeeId);

  const [taskRows, empRows, setRows] = await Promise.all([
    db
      .select({ at: taskEvents.createdAt, eventType: taskEvents.eventType })
      .from(taskEvents)
      .where(taskWhere)
      .orderBy(desc(taskEvents.createdAt))
      .limit(limit),
    db
      .select({
        at: employeeEvents.createdAt,
        eventType: employeeEvents.eventType,
        note: employeeEvents.note,
      })
      .from(employeeEvents)
      .where(empWhere)
      .orderBy(desc(employeeEvents.createdAt))
      .limit(limit),
    db
      .select({
        at: settingsEvents.createdAt,
        eventType: settingsEvents.eventType,
        scope: settingsEvents.scope,
      })
      .from(settingsEvents)
      .where(setWhere)
      .orderBy(desc(settingsEvents.createdAt))
      .limit(limit),
  ]);

  const merged: ActivityEntry[] = [
    ...taskRows.map((r) => ({
      at: r.at,
      kind: "task" as const,
      eventType: r.eventType,
      detail: null,
    })),
    ...empRows.map((r) => ({
      at: r.at,
      kind: "employee" as const,
      eventType: r.eventType,
      detail: r.note ?? null,
    })),
    ...setRows.map((r) => ({
      at: r.at,
      kind: "settings" as const,
      eventType: r.eventType,
      detail: r.scope ?? null,
    })),
  ];

  // Merge-sort the three streams, then cut. Each was limited independently, so
  // the union can exceed `limit`; trimming after the sort keeps the newest
  // events rather than an arbitrary third of each kind.
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());
  return merged.slice(0, limit);
}

/** The retention schedule, for the admin panel and the anonymisation cron. */
export async function listRetentionPolicies() {
  return db
    .select()
    .from(dataRetentionPolicies)
    .orderBy(desc(dataRetentionPolicies.retentionDays));
}

export async function getRetentionDays(recordClass: string): Promise<number | null> {
  const [row] = await db
    .select({ days: dataRetentionPolicies.retentionDays, enabled: dataRetentionPolicies.purgeEnabled })
    .from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.recordClass, recordClass))
    .limit(1);
  if (!row || !row.enabled) return null;
  return row.days;
}

/**
 * Exit register (idea 14) — every departure in a period, flattened for CSV.
 * What HR needs at year end and what an auditor asks for first.
 */
export async function listExitRegister(from: Date | null, to: Date | null) {
  const clauses = [];
  if (from) clauses.push(gte(employeeExits.archivedAt, from));
  if (to) clauses.push(sql`${employeeExits.archivedAt} <= ${to}`);

  const successor = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .as("successor");
  const archiver = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .as("archiver");

  return db
    .select({
      name: employees.name,
      email: employees.email,
      department: employees.department,
      role: employees.role,
      joinedAt: employeeExits.joinedAt,
      resignationDate: employeeExits.resignationDate,
      lastWorkingDay: employeeExits.lastWorkingDay,
      noticeServed: employeeExits.noticeServed,
      noticeDays: employeeExits.noticeDays,
      paidInLieu: employeeExits.paidInLieu,
      exitReason: employeeExits.exitReason,
      exitReasonOther: employeeExits.exitReasonOther,
      rehireEligibility: employeeExits.rehireEligibility,
      rehireNote: employeeExits.rehireNote,
      successorName: successor.name,
      archivedAt: employeeExits.archivedAt,
      archivedBy: archiver.name,
      legalHold: employees.legalHold,
    })
    .from(employeeExits)
    .innerJoin(employees, eq(employees.id, employeeExits.employeeId))
    .leftJoin(successor, eq(successor.id, employeeExits.successorId))
    .leftJoin(archiver, eq(archiver.id, employeeExits.archivedById))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(employeeExits.archivedAt));
}

/**
 * The Previous Employees table, fully denormalised for rendering.
 *
 * Dates come back as ISO strings rather than Date objects because this crosses
 * the server/client boundary into a "use client" table — a Date would either
 * be serialised implicitly or throw, depending on the field, and the component
 * formats them itself anyway.
 */
export async function getFormerEmployeeDetails() {
  const successor = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .as("successor_e");
  const archiver = db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .as("archiver_e");

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      role: employees.role,
      department: employees.department,
      joinedAt: employees.joinedAt,
      lastWorkingDay: employees.lastWorkingDay,
      legalHold: employees.legalHold,
      anonymisedAt: employees.anonymisedAt,
      exitReason: employeeExits.exitReason,
      exitReasonOther: employeeExits.exitReasonOther,
      rehireEligibility: employeeExits.rehireEligibility,
      rehireNote: employeeExits.rehireNote,
      resignationDate: employeeExits.resignationDate,
      noticeServed: employeeExits.noticeServed,
      noticeDays: employeeExits.noticeDays,
      paidInLieu: employeeExits.paidInLieu,
      notes: employeeExits.notes,
      handover: employeeExits.handover,
      reassigned: employeeExits.reassigned,
      firebaseDeleted: employeeExits.firebaseDeleted,
      archivedAt: employeeExits.archivedAt,
      successorName: successor.name,
      archivedByName: archiver.name,
    })
    .from(employees)
    .leftJoin(employeeExits, eq(employeeExits.employeeId, employees.id))
    .leftJoin(successor, eq(successor.id, employeeExits.successorId))
    .leftJoin(archiver, eq(archiver.id, employeeExits.archivedById))
    .where(inArray(employees.employmentStatus, ["former", "anonymised"]))
    .orderBy(desc(employeeExits.archivedAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as string,
    department: r.department,
    joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
    lastWorkingDay: r.lastWorkingDay ?? null,
    exitReason: r.exitReason,
    exitReasonOther: r.exitReasonOther,
    rehireEligibility: r.rehireEligibility,
    legalHold: r.legalHold,
    anonymisedAt: r.anonymisedAt ? r.anonymisedAt.toISOString() : null,
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
    successorName: r.successorName ?? null,
    resignationDate: r.resignationDate ?? null,
    noticeServed: r.noticeServed ?? null,
    noticeDays: r.noticeDays ?? null,
    paidInLieu: r.paidInLieu ?? false,
    rehireNote: r.rehireNote ?? null,
    notes: r.notes ?? null,
    handover: (r.handover as Record<string, unknown> | null) ?? null,
    reassigned: (r.reassigned as Record<string, number> | null) ?? null,
    archivedByName: r.archivedByName ?? null,
    firebaseDeleted: r.firebaseDeleted ?? false,
  }));
}
