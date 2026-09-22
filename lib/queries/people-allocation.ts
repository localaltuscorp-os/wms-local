import "server-only";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { paPeople, paEntries, paCalls, paAmbassadors, hhAccessGrants, hhAccessActivity, employees } from "@/db/schema";

/**
 * Read side of Hand-holding.
 *
 * Two rosters (employees and interns) and their entries, fetched whole: the
 * lists are small and fixed, so one read per page beats a query per selection.
 */

export interface HhCall {
  id: string;
  /** The row this call belongs to — an entry id, or an ambassador id. */
  entryId: string;
  seq: number;
  callType: string;
  day: string;
  durationMin: number;
}

export interface HhEntry {
  id: string;
  /** Null while the row sits in the Client Engagement unassigned pool (0230). */
  personId: string | null;
  /** Nullable in the table (`pa_entries.section` has no NOT NULL), so the type
   *  says so rather than the read pretending otherwise. */
  section: string | null;
  name: string;
  batchNo: string | null;
  onHold: boolean;
  startDate: string | null;
  endDate: string | null;
  /** The colour band (0194's `highlight`): active | barter | revenue_share, or null. */
  highlight: string | null;
}

export interface HhPerson {
  id: string;
  name: string;
  kind: string;
  /** The employee whose Daily Compliance this name shows (lib/hh/calendar.ts). */
  employeeId: string | null;
  employeeName: string | null;
  /** A Client Engagement team lead (0230). */
  isCeLead: boolean;
}

export interface Ambassador {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** Multi-select — section codes from ALLOCATION_CATEGORIES. */
  products: string[];
  batchNo: string | null;
  startDate: string | null;
  endDate: string | null;
  onHold: boolean;
  /** The lead who carries them; null while unassigned (0230). */
  ownerPersonId: string | null;
  /** active | barter | revenue_share, or null until set (0230). */
  status: string | null;
}

export async function listHhPeople(): Promise<HhPerson[]> {
  return db
    .select({
      id: paPeople.id,
      name: paPeople.name,
      kind: paPeople.kind,
      isCeLead: paPeople.isCeLead,
      employeeId: paPeople.employeeId,
      employeeName: employees.name,
    })
    .from(paPeople)
    .leftJoin(employees, eq(employees.id, paPeople.employeeId))
    .where(eq(paPeople.isActive, true))
    .orderBy(asc(paPeople.createdAt));
}

export async function listHhEntries(): Promise<HhEntry[]> {
  return db
    .select({
      id: paEntries.id,
      personId: paEntries.personId,
      section: paEntries.section,
      name: paEntries.name,
      batchNo: paEntries.batchNo,
      onHold: paEntries.onHold,
      startDate: paEntries.startDate,
      endDate: paEntries.endDate,
      highlight: paEntries.highlight,
    })
    .from(paEntries)
    // An archived entry (its batch is over) stays in the table for the record,
    // but never on the board.
    .where(isNull(paEntries.archivedAt))
    .orderBy(asc(paEntries.section), asc(paEntries.createdAt));
}

export async function listAmbassadors(): Promise<Ambassador[]> {
  return db
    .select({
      id: paAmbassadors.id,
      name: paAmbassadors.name,
      email: paAmbassadors.email,
      phone: paAmbassadors.phone,
      notes: paAmbassadors.notes,
      products: paAmbassadors.products,
      batchNo: paAmbassadors.batchNo,
      startDate: paAmbassadors.startDate,
      endDate: paAmbassadors.endDate,
      onHold: paAmbassadors.onHold,
      ownerPersonId: paAmbassadors.ownerPersonId,
      status: paAmbassadors.status,
    })
    .from(paAmbassadors)
    .where(eq(paAmbassadors.isActive, true))
    .orderBy(asc(paAmbassadors.name));
}

export async function listHhCalls(): Promise<HhCall[]> {
  const rows = await db
    .select({
      id: paCalls.id,
      entryId: paCalls.entryId,
      seq: paCalls.seq,
      callType: paCalls.callType,
      day: paCalls.day,
      durationMin: paCalls.durationMin,
    })
    .from(paCalls)
    .where(isNotNull(paCalls.entryId))
    .orderBy(asc(paCalls.seq));
  // entryId is nullable in the table but never null under this filter.
  return rows.map((r) => ({ ...r, entryId: r.entryId! }));
}

/** The same calls table, read from the ambassador side. */
export async function listAmbassadorCalls(): Promise<HhCall[]> {
  const rows = await db
    .select({
      id: paCalls.id,
      entryId: paCalls.ambassadorId,
      seq: paCalls.seq,
      callType: paCalls.callType,
      day: paCalls.day,
      durationMin: paCalls.durationMin,
    })
    .from(paCalls)
    .where(isNotNull(paCalls.ambassadorId))
    .orderBy(asc(paCalls.seq));
  return rows.map((r) => ({ ...r, entryId: r.entryId! }));
}

export interface AccessGrant {
  id: string;
  role: string;
  module: string;
  section: string;
  action: string;
  description: string | null;
}

/** Grants written down in the Access / Permissions dialog. */
export async function listAccessGrants(): Promise<AccessGrant[]> {
  return db
    .select({
      id: hhAccessGrants.id,
      role: hhAccessGrants.role,
      module: hhAccessGrants.module,
      section: hhAccessGrants.section,
      action: hhAccessGrants.action,
      description: hhAccessGrants.description,
    })
    .from(hhAccessGrants)
    .orderBy(asc(hhAccessGrants.role), asc(hhAccessGrants.module), asc(hhAccessGrants.section));
}

export interface AccessActivity {
  id: string;
  role: string;
  module: string;
  section: string;
  personName: string;
  action: string;
  occurredOn: string;
  day: string;
  occurredAt: string;
  /** Free text saved with the grant. Null until someone writes one. */
  description: string | null;
}

/** The Access Activity log, newest last so the table reads as it happened. */
export async function listAccessActivity(): Promise<AccessActivity[]> {
  const rows = await db
    .select({
      id: hhAccessActivity.id,
      role: hhAccessActivity.role,
      module: hhAccessActivity.module,
      section: hhAccessActivity.section,
      personName: hhAccessActivity.personName,
      action: hhAccessActivity.action,
      occurredOn: hhAccessActivity.occurredOn,
      day: hhAccessActivity.day,
      occurredAt: hhAccessActivity.occurredAt,
      description: hhAccessActivity.description,
    })
    .from(hhAccessActivity)
    .orderBy(desc(hhAccessActivity.occurredAt))
    .limit(200);
  return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
}

export interface Participant {
  id: string;
  name: string;
  /** ps | bss | retainer | ecosystem, or null until a Product is chosen. */
  section: string | null;
  /** mon..sun, or null while unset. */
  day: string | null;
  /** An HH_CALL_TYPES code, or null while unset. */
  callType: string | null;
  /** That call's length in minutes, or null while unset. Shown as HH:MM. */
  durationMin: number | null;
  /** The engagement's window. Either end may be unset. */
  startDate: string | null;
  endDate: string | null;
  onHold: boolean;
  /** The employee or intern who carries this participant — "Unassigned" while nobody does. */
  ownerName: string;
  ownerKind: string;
  /** Null while the row sits in the unassigned pool (0230). */
  ownerId: string | null;
  createdAt: string;
}

/**
 * Every participant in the module — PS and BSS included — flattened across all
 * people, for the All Participants list.
 */
export async function listAllParticipants(): Promise<Participant[]> {
  const rows = await db
    .select({
      id: paEntries.id,
      name: paEntries.name,
      section: paEntries.section,
      day: paEntries.day,
      callType: paEntries.callType,
      durationMin: paEntries.durationMin,
      startDate: paEntries.startDate,
      endDate: paEntries.endDate,
      onHold: paEntries.onHold,
      ownerName: paPeople.name,
      ownerKind: paPeople.kind,
      ownerId: paPeople.id,
      createdAt: paEntries.createdAt,
    })
    .from(paEntries)
    // LEFT join, not inner: an entry in the unassigned pool has no owner yet and
    // must still be listed (0230).
    .leftJoin(paPeople, eq(paEntries.personId, paPeople.id))
    .where(isNull(paEntries.archivedAt))
    .orderBy(asc(paEntries.createdAt));
  return rows.map((r) => ({
    ...r,
    ownerName: r.ownerName ?? "Unassigned",
    ownerKind: r.ownerKind ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
}
