import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccEntries, dccKpiItems, designations, employees } from "@/db/schema";
import { businessEmailFor } from "@/lib/email/recipients";
import { activeFromOf, loadFirstEntryDates } from "@/lib/queries/dcc-dashboard";
import type { ComplianceItem } from "@/lib/compliance/schedule";

/**
 * WCC / MCC reads — the people, their compliances, and the fills in a window.
 *
 * The compliances are DCC's own (dcc_kpi_items); see lib/compliance/schedule.ts
 * for which of them are on which checklist.
 */

export interface CompliancePerson {
  id: string;
  name: string;
  managerId: string | null;
  designation: string | null;
  /** The work address a reminder goes to — never the personal inbox. */
  address: string | null;
  email: string;
}

export interface ComplianceFill {
  id: string;
  itemId: string;
  entryDate: string;
  /** The old DCC word — kept for rows the Android app writes. */
  status: string | null;
  doerStatus: string | null;
  doneAt: string | null;
  note: string | null;
  approverStatus: string | null;
  approverNotes: string | null;
  /** How many were completed (0239); null when not recorded. */
  completedQuantity: number | null;
  /** DCC's own numeric value — the count a fill from the old board or the app carries. */
  valueNumber: string | null;
  updatedAt: string | null;
}

/** Postgres 42703 — a column 0238, 0239, 0240 or 0242 adds is not there yet. */
export function isMissingColumn(e: unknown): boolean {
  const code = (v: unknown) => (typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined);
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return code(e) === "42703" || code(cause) === "42703";
}

/** Every active employee, with their manager and work address. */
export async function loadCompliancePeople(): Promise<CompliancePerson[]> {
  const rows = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          email: employees.email,
          officialEmail: employees.officialEmail,
          managerId: employees.managerId,
          designation: designations.name,
        })
        .from(employees)
        .leftJoin(designations, eq(designations.id, employees.designationId))
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.name)),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "compliance-people" },
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    managerId: r.managerId,
    designation: r.designation ?? null,
    address: businessEmailFor(r),
    email: r.email,
  }));
}

/**
 * The live compliances of these people that sit on WCC or MCC. Participant
 * lists, ad-hoc and event compliances are filtered out here, before they cost
 * anything further down.
 */
export async function loadComplianceItems(ownerIds: string[]): Promise<ComplianceItem[]> {
  if (ownerIds.length === 0) return [];
  const base = {
    id: dccKpiItems.id,
    ownerEmployeeId: dccKpiItems.ownerEmployeeId,
    title: dccKpiItems.title,
    section: dccKpiItems.section,
    code: dccKpiItems.code,
    frequency: dccKpiItems.frequency,
    weekdays: dccKpiItems.weekdays,
    scheduleKind: dccKpiItems.scheduleKind,
    isParticipantList: dccKpiItems.isParticipantList,
    sortOrder: dccKpiItems.sortOrder,
    createdById: dccKpiItems.createdById,
    createdAt: dccKpiItems.createdAt,
    targetNumber: dccKpiItems.targetNumber,
    unit: dccKpiItems.unit,
  };
  const read = (fields: typeof base) =>
    db
      .select(fields)
      .from(dccKpiItems)
      .where(
        and(
          inArray(dccKpiItems.ownerEmployeeId, ownerIds),
          eq(dccKpiItems.archived, false),
          eq(dccKpiItems.isParticipantList, false),
          or(
            eq(dccKpiItems.scheduleKind, "scheduled"),
            eq(dccKpiItems.scheduleKind, "weekly"),
            eq(dccKpiItems.scheduleKind, "monthly"),
          ),
        ),
      )
      .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code), asc(dccKpiItems.title));

  type Row = Awaited<ReturnType<typeof read>>[number] & {
    monthDay?: number | null;
    mccFrequency?: string | null;
    mccDays?: number[] | null;
    mccStartMonth?: number | null;
    minutes?: number | null;
  };
  const since0238 = { monthDay: dccKpiItems.monthDay };
  const since0240 = {
    mccFrequency: dccKpiItems.mccFrequency,
    mccDays: dccKpiItems.mccDays,
    mccStartMonth: dccKpiItems.mccStartMonth,
  };
  const since0242 = { minutes: dccKpiItems.minutes };
  // Newest schema first, stepping back a migration at a time: before 0242 no
  // compliance has Mins yet; before 0240 every MCC compliance reads as Monthly.
  const attempts = [
    { ...base, ...since0238, ...since0240, ...since0242 },
    { ...base, ...since0238, ...since0240 },
    { ...base, ...since0238 },
    base,
  ];
  let rows: Row[] = [];
  for (const [i, fields] of attempts.entries()) {
    try {
      rows = (await read(fields as typeof base)) as Row[];
      break;
    } catch (e) {
      if (!isMissingColumn(e) || i === attempts.length - 1) throw e;
    }
  }
  const first = await loadFirstEntryDates(ownerIds);
  return rows.map(({ createdAt, ...r }) => ({
    ...r,
    monthDay: r.monthDay ?? null,
    mccFrequency: r.mccFrequency ?? null,
    mccDays: r.mccDays ?? null,
    mccStartMonth: r.mccStartMonth ?? null,
    minutes: r.minutes ?? null,
    activeFrom: activeFromOf(createdAt, first.get(r.id)),
  }));
}

/** Every fill of these compliances between two dates, inclusive. */
export async function loadComplianceFills(itemIds: string[], from: string, to: string): Promise<ComplianceFill[]> {
  if (itemIds.length === 0) return [];
  const base = {
    id: dccEntries.id,
    itemId: dccEntries.itemId,
    entryDate: dccEntries.entryDate,
    status: dccEntries.status,
    note: dccEntries.note,
    valueNumber: dccEntries.valueNumber,
    updatedAt: dccEntries.updatedAt,
  };
  const since0238 = {
    doerStatus: dccEntries.doerStatus,
    doneAt: dccEntries.doneAt,
    approverStatus: dccEntries.approverStatus,
    approverNotes: dccEntries.approverNotes,
  };
  const since0239 = { completedQuantity: dccEntries.completedQuantity };
  const read = (fields: typeof base) =>
    db
      .select(fields)
      .from(dccEntries)
      .where(
        and(
          inArray(dccEntries.itemId, itemIds),
          gte(dccEntries.entryDate, from),
          lte(dccEntries.entryDate, to),
          isNull(dccEntries.subjectId),
        ),
      );

  type Row = Awaited<ReturnType<typeof read>>[number] & {
    doerStatus?: string | null;
    doneAt?: Date | null;
    approverStatus?: string | null;
    approverNotes?: string | null;
    completedQuantity?: number | null;
  };
  // Newest schema first, stepping back one migration at a time, so the page
  // still opens on a database that is behind.
  const attempts = [{ ...base, ...since0238, ...since0239 }, { ...base, ...since0238 }, base];
  let rows: Row[] = [];
  for (const [i, fields] of attempts.entries()) {
    try {
      rows = (await read(fields as typeof base)) as Row[];
      break;
    } catch (e) {
      if (!isMissingColumn(e) || i === attempts.length - 1) throw e;
    }
  }
  return rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    entryDate: r.entryDate,
    status: r.status,
    note: r.note,
    doerStatus: r.doerStatus ?? null,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    approverStatus: r.approverStatus ?? null,
    approverNotes: r.approverNotes ?? null,
    completedQuantity: r.completedQuantity ?? null,
    valueNumber: r.valueNumber ?? null,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));
}
