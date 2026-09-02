import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccKpiItems, dccEntries, dccReviews, dccClients, dccSubjects, dccItemSubjects, employees } from "@/db/schema";

export interface DccItemRow {
  id: string;
  ownerEmployeeId: string;
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  weekdays: number | null;
  scheduleKind: string | null;
  isParticipantList: boolean | null;
  clientId: string | null;
  templateCode: string | null;
  needsReview: boolean | null;
  targetNumber: string | null;
  unit: string | null;
  sortOrder: number | null;
}

export interface DccEntryRow {
  itemId: string;
  entryDate: string; // YYYY-MM-DD
  status: string | null;
  valueNumber: string | null;
  note: string | null;
  subjectId: string | null;
}

export interface DccClientRow {
  id: string;
  ownerEmployeeId: string;
  section: string;
  name: string;
  sortOrder: number;
}
export interface DccSubjectRow {
  id: string;
  ownerEmployeeId: string;
  name: string;
  kind: string | null;
  sortOrder: number;
}
export interface DccItemSubjectRow {
  id: string;
  itemId: string;
  subjectId: string;
  scheduleKind: string | null;
  weekdays: number | null;
  sortOrder: number;
}

export interface DccPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
}

/** KPI items for one person, ordered by section then sort/code. */
export async function listOwnerItems(ownerId: string): Promise<DccItemRow[]> {
  return withRetry(
    () =>
      db
        .select({
          id: dccKpiItems.id,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          section: dccKpiItems.section,
          code: dccKpiItems.code,
          title: dccKpiItems.title,
          frequency: dccKpiItems.frequency,
          weekdays: dccKpiItems.weekdays,
          scheduleKind: dccKpiItems.scheduleKind,
          isParticipantList: dccKpiItems.isParticipantList,
          clientId: dccKpiItems.clientId,
          templateCode: dccKpiItems.templateCode,
          needsReview: dccKpiItems.needsReview,
          targetNumber: dccKpiItems.targetNumber,
          unit: dccKpiItems.unit,
          sortOrder: dccKpiItems.sortOrder,
        })
        .from(dccKpiItems)
        .where(and(eq(dccKpiItems.ownerEmployeeId, ownerId), eq(dccKpiItems.archived, false)))
        .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-items" },
  );
}

/** All entries for one person's items since `fromDate` (inclusive). */
export async function listOwnerEntries(ownerId: string, fromDate: string): Promise<DccEntryRow[]> {
  return withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
          subjectId: dccEntries.subjectId,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(and(eq(dccKpiItems.ownerEmployeeId, ownerId), gte(dccEntries.entryDate, fromDate))),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-entries" },
  );
}

/** People (with KPI items) the viewer can see, for the team/dashboard roster. */
export async function listDccPeople(visibleIds: string[]): Promise<DccPerson[]> {
  if (visibleIds.length === 0) return [];
  const rows = await withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
        .from(employees)
        .where(inArray(employees.id, visibleIds)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-people" },
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** All items (id/owner/weekdays/target) for a set of owners — roster aggregation. */
export async function listItemsForOwners(ownerIds: string[]): Promise<Pick<DccItemRow, "id" | "ownerEmployeeId" | "weekdays" | "scheduleKind" | "isParticipantList" | "targetNumber">[]> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          id: dccKpiItems.id,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          weekdays: dccKpiItems.weekdays,
          scheduleKind: dccKpiItems.scheduleKind,
          isParticipantList: dccKpiItems.isParticipantList,
          targetNumber: dccKpiItems.targetNumber,
        })
        .from(dccKpiItems)
        .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), eq(dccKpiItems.archived, false))),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-items-roster" },
  );
}

/** Entries for a set of owners since fromDate — roster/analytics aggregation. */
export async function listEntriesForOwners(ownerIds: string[], fromDate: string): Promise<Array<DccEntryRow & { ownerEmployeeId: string }>> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
          subjectId: dccEntries.subjectId,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), gte(dccEntries.entryDate, fromDate))),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-entries-roster" },
  );
}

/** Reviews for a set of owners since fromDate. */
export async function listReviewsForOwners(ownerIds: string[], fromDate: string): Promise<Array<{ ownerEmployeeId: string; reviewDate: string; status: string | null; note: string | null }>> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          ownerEmployeeId: dccReviews.ownerEmployeeId,
          reviewDate: dccReviews.reviewDate,
          status: dccReviews.status,
          note: dccReviews.note,
        })
        .from(dccReviews)
        .where(and(inArray(dccReviews.ownerEmployeeId, ownerIds), gte(dccReviews.reviewDate, fromDate))),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-reviews" },
  );
}

// ── DCC v2 roster-axis loaders ───────────────────────────────────────────────

/** Client instances (Lawrence & Mayo, Soul Storii…) for a person's sections. */
export async function listOwnerClients(ownerId: string): Promise<DccClientRow[]> {
  return withRetry(
    () =>
      db
        .select({
          id: dccClients.id,
          ownerEmployeeId: dccClients.ownerEmployeeId,
          section: dccClients.section,
          name: dccClients.name,
          sortOrder: dccClients.sortOrder,
        })
        .from(dccClients)
        .where(and(eq(dccClients.ownerEmployeeId, ownerId), eq(dccClients.archived, false)))
        .orderBy(asc(dccClients.section), asc(dccClients.sortOrder)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-clients" },
  );
}

/** Participant roster (external people) for a person. */
export async function listOwnerSubjects(ownerId: string): Promise<DccSubjectRow[]> {
  return withRetry(
    () =>
      db
        .select({
          id: dccSubjects.id,
          ownerEmployeeId: dccSubjects.ownerEmployeeId,
          name: dccSubjects.name,
          kind: dccSubjects.kind,
          sortOrder: dccSubjects.sortOrder,
        })
        .from(dccSubjects)
        .where(and(eq(dccSubjects.ownerEmployeeId, ownerId), eq(dccSubjects.archived, false)))
        .orderBy(asc(dccSubjects.sortOrder), asc(dccSubjects.name)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-subjects" },
  );
}

/** Item→subject links (with per-subject overrides) for the given participant items. */
export async function listItemSubjectsForItems(itemIds: string[]): Promise<DccItemSubjectRow[]> {
  if (itemIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          id: dccItemSubjects.id,
          itemId: dccItemSubjects.itemId,
          subjectId: dccItemSubjects.subjectId,
          scheduleKind: dccItemSubjects.scheduleKind,
          weekdays: dccItemSubjects.weekdays,
          sortOrder: dccItemSubjects.sortOrder,
        })
        .from(dccItemSubjects)
        .where(and(inArray(dccItemSubjects.itemId, itemIds), eq(dccItemSubjects.archived, false)))
        .orderBy(asc(dccItemSubjects.sortOrder)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-item-subjects" },
  );
}
