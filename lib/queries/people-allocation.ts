import "server-only";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { paPeople, paEntries, paCalls, paAmbassadors, hhAccessGrants, hhAccessActivity } from "@/db/schema";

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
  personId: string;
  /** Nullable in the table (`pa_entries.section` has no NOT NULL), so the type
   *  says so rather than the read pretending otherwise. */
  section: string | null;
  name: string;
  batchNo: string | null;
  onHold: boolean;
  startDate: string | null;
  endDate: string | null;
}

export interface HhPerson {
  id: string;
  name: string;
  kind: string;
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
}

export async function listHhPeople(): Promise<HhPerson[]> {
  return db
    .select({ id: paPeople.id, name: paPeople.name, kind: paPeople.kind })
    .from(paPeople)
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
    })
    .from(paEntries)
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
  /** The employee or intern who carries this participant. */
  ownerName: string;
  ownerKind: string;
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
      createdAt: paEntries.createdAt,
    })
    .from(paEntries)
    .innerJoin(paPeople, eq(paEntries.personId, paPeople.id))
    .orderBy(asc(paEntries.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
