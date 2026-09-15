import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  opsChecklistItems,
  opsChecklistChecks,
  opsChecklistRuns,
  opsChecklistTemplates,
  employees,
  calendarEvents,
  eventCategories,
} from "@/db/schema";
import {
  DEFAULT_STATUS,
  isCheckStatus,
  isRunStatus,
  type ChecklistEventRow,
  type ChecklistItemRow,
  type ChecklistPersonRow,
  type ChecklistRunRow,
  type ChecklistTemplateRow,
} from "@/lib/operations/checklist";

/**
 * Postgres 42P01 — "undefined_table".
 *
 * The checklist's four tables ship in migration 0221, and this repo applies
 * migrations BY HAND in Supabase (the Drizzle journal stopped at 0019; see
 * db/RUN-IN-SUPABASE-0221-0222.sql). So there is a real, expected window where the
 * code is deployed and the tables are not — and in that window every read here
 * throws, which turns the whole page into a 500 with a stack trace.
 *
 * Detecting it lets the page say "this needs its migration run" instead, which
 * is a thing somebody can act on. Matched on the SQLSTATE rather than on the
 * message text, which is localised and version-dependent.
 *
 * 42703 — "undefined_column" — is caught by the same net on purpose. 0221 was
 * reshaped for the offset model after an earlier draft had been circulated, so
 * a database carrying the OLD shape fails on a missing column rather than a
 * missing table, and that deserves the same actionable notice instead of a
 * stack trace.
 */
export function isMissingChecklistTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  // node-postgres wraps the driver error on some paths; check one level down.
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}

/* Employees is joined three times on the grid read — doer, backup, and the
   person who last touched the tick — and an unaliased repeat join onto the same
   table is a runtime ambiguity, not a type error. */
const doer = alias(employees, "ops_checklist_doer");
const backup = alias(employees, "ops_checklist_backup");

/** Every run, newest event first. The Checklist landing lists these. */
export async function listChecklistRuns(): Promise<ChecklistRunRow[]> {
  const rows = await db
    .select({
      id: opsChecklistRuns.id,
      title: opsChecklistRuns.title,
      isEvent: opsChecklistRuns.isEvent,
      eventId: opsChecklistRuns.eventId,
      eventDate: opsChecklistRuns.eventDate,
      status: opsChecklistRuns.status,
      notes: opsChecklistRuns.notes,
      eventTitle: calendarEvents.title,
      calendarDate: calendarEvents.eventDate,
    })
    .from(opsChecklistRuns)
    .leftJoin(calendarEvents, eq(calendarEvents.id, opsChecklistRuns.eventId))
    .orderBy(desc(opsChecklistRuns.eventDate), desc(opsChecklistRuns.createdAt));

  return rows.map(toRunRow);
}

/** One run by id, or null. */
export async function getChecklistRun(id: string): Promise<ChecklistRunRow | null> {
  const rows = await db
    .select({
      id: opsChecklistRuns.id,
      title: opsChecklistRuns.title,
      isEvent: opsChecklistRuns.isEvent,
      eventId: opsChecklistRuns.eventId,
      eventDate: opsChecklistRuns.eventDate,
      status: opsChecklistRuns.status,
      notes: opsChecklistRuns.notes,
      eventTitle: calendarEvents.title,
      calendarDate: calendarEvents.eventDate,
    })
    .from(opsChecklistRuns)
    .leftJoin(calendarEvents, eq(calendarEvents.id, opsChecklistRuns.eventId))
    .where(eq(opsChecklistRuns.id, id))
    .limit(1);

  const r = rows[0];
  return r ? toRunRow(r) : null;
}

function toRunRow(r: {
  id: string;
  title: string;
  isEvent: boolean;
  eventId: string | null;
  eventDate: string | null;
  status: string;
  notes: string | null;
  eventTitle: string | null;
  calendarDate: string | null;
}): ChecklistRunRow {
  return {
    id: r.id,
    title: r.title,
    isEvent: r.isEvent,
    eventId: r.eventId,
    eventDate: r.eventDate,
    eventTitle: r.eventTitle,
    // Only meaningful when it DIFFERS from the run's own copy — that is the
    // "the event moved, recalculate?" banner. Null when they agree, so the
    // client does not have to compare.
    calendarDate:
      r.calendarDate && r.calendarDate !== r.eventDate ? r.calendarDate : null,
    status: isRunStatus(r.status) ? r.status : "active",
    notes: r.notes,
  };
}

/**
 * The grid: every row of one run, with its tick.
 *
 * LEFT JOIN on the checks, because a row that nobody has touched has no check
 * row at all — inner-joining would silently hide every untouched item, which is
 * most of a fresh checklist.
 */
export async function listRunItems(runId: string): Promise<ChecklistItemRow[]> {
  const rows = await db
    .select({
      id: opsChecklistItems.id,
      code: opsChecklistItems.code,
      title: opsChecklistItems.title,
      category: opsChecklistItems.category,
      offsetDays: opsChecklistItems.offsetDays,
      targetDate: opsChecklistItems.targetDate,
      doerId: opsChecklistItems.doerId,
      doerName: doer.name,
      backupId: opsChecklistItems.backupId,
      backupName: backup.name,
      instructions: opsChecklistItems.instructions,
      fileLink: opsChecklistItems.fileLink,
      jdEntryId: opsChecklistItems.jdEntryId,
      sortOrder: opsChecklistItems.sortOrder,
      isActive: opsChecklistItems.isActive,
      status: opsChecklistChecks.status,
      notes: opsChecklistChecks.notes,
      doneAt: opsChecklistChecks.doneAt,
    })
    .from(opsChecklistItems)
    .leftJoin(doer, eq(doer.id, opsChecklistItems.doerId))
    .leftJoin(backup, eq(backup.id, opsChecklistItems.backupId))
    .leftJoin(
      opsChecklistChecks,
      and(
        eq(opsChecklistChecks.itemId, opsChecklistItems.id),
        eq(opsChecklistChecks.runId, runId),
      ),
    )
    .where(and(eq(opsChecklistItems.runId, runId), eq(opsChecklistItems.isActive, true)))
    .orderBy(asc(opsChecklistItems.offsetDays), asc(opsChecklistItems.sortOrder));

  return rows.map((r) => ({
    ...r,
    status: isCheckStatus(r.status) ? r.status : DEFAULT_STATUS,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
  }));
}

/** The reusable master checklists, with how many rows each holds. */
export async function listChecklistTemplates(): Promise<ChecklistTemplateRow[]> {
  const rows = await db
    .select({
      id: opsChecklistTemplates.id,
      name: opsChecklistTemplates.name,
      isEvent: opsChecklistTemplates.isEvent,
      description: opsChecklistTemplates.description,
      isActive: opsChecklistTemplates.isActive,
      itemCount: sql<number>`count(${opsChecklistItems.id})::int`,
    })
    .from(opsChecklistTemplates)
    .leftJoin(
      opsChecklistItems,
      and(
        eq(opsChecklistItems.templateId, opsChecklistTemplates.id),
        eq(opsChecklistItems.isActive, true),
      ),
    )
    .where(eq(opsChecklistTemplates.isActive, true))
    .groupBy(
      opsChecklistTemplates.id,
      opsChecklistTemplates.name,
      opsChecklistTemplates.isEvent,
      opsChecklistTemplates.description,
      opsChecklistTemplates.isActive,
    )
    .orderBy(asc(opsChecklistTemplates.name));

  return rows;
}

/** A template's rows, for the duplicate preview and the copy itself. */
export async function listTemplateItems(templateId: string) {
  return db
    .select({
      id: opsChecklistItems.id,
      code: opsChecklistItems.code,
      title: opsChecklistItems.title,
      category: opsChecklistItems.category,
      offsetDays: opsChecklistItems.offsetDays,
      targetDate: opsChecklistItems.targetDate,
      doerId: opsChecklistItems.doerId,
      backupId: opsChecklistItems.backupId,
      instructions: opsChecklistItems.instructions,
      fileLink: opsChecklistItems.fileLink,
      jdEntryId: opsChecklistItems.jdEntryId,
      sortOrder: opsChecklistItems.sortOrder,
    })
    .from(opsChecklistItems)
    .where(and(eq(opsChecklistItems.templateId, templateId), eq(opsChecklistItems.isActive, true)))
    .orderBy(asc(opsChecklistItems.offsetDays), asc(opsChecklistItems.sortOrder));
}

/**
 * Events a checklist can hang off. Future first, then the recent past — a
 * checklist is usually being built ahead of an event, but back-filling one that
 * has just happened is legitimate and should not need a search.
 */
export async function listChecklistEvents(): Promise<ChecklistEventRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  const sinceYmd = since.toISOString().slice(0, 10);

  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      eventDate: calendarEvents.eventDate,
      categoryName: eventCategories.name,
    })
    .from(calendarEvents)
    .leftJoin(eventCategories, eq(eventCategories.id, calendarEvents.categoryId))
    .where(gte(calendarEvents.eventDate, sinceYmd))
    .orderBy(asc(calendarEvents.eventDate))
    .limit(300);
}

/** Active staff, for the Doer and Backup pickers. */
export async function listChecklistPeople(): Promise<ChecklistPersonRow[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}
