import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jdAssignments,
  jdAttachments,
  jdDoerNotes,
  jdEntries,
  jdPositions,
  jdPositionHolders,
  jdRanks,
  employees,
  calendarEvents,
  opsChecklistItems,
  opsChecklistRuns,
} from "@/db/schema";
import { readRecurrence, type Recurrence } from "@/lib/jd/recurrence";
import type { TargetPeople } from "@/lib/jd/assignment-targets";
import type { JdAttachmentKind } from "@/lib/jd/attachments";
import type { BusinessFunction } from "@/lib/org/functions";

/**
 * Postgres 42P01 / 42703 — the table or a column is not there.
 *
 * Migration 0222 is applied BY HAND in Supabase (the Drizzle journal stopped at
 * 0019), so there is a real, expected window where this code is deployed and
 * its tables are not. Detecting it lets the page say "run the migration"
 * instead of rendering a 500 with a stack trace — the same guard the Operations
 * checklist carries, for the same reason.
 */
export function isMissingJdTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}

export interface JdRankRow {
  id: string;
  name: string;
  rankOrder: number;
  band: string | null;
}

export interface JdPositionRow {
  id: string;
  functionKey: string;
  rankId: string;
  rankName: string;
  rankOrder: number;
  variant: string | null;
  title: string;
  /** How many ACTIVE people sit in this seat right now. 0 ⇒ it escalates. */
  holderCount: number;
}

export interface JdEntryRow {
  id: string;
  serialNo: string;
  /** Null on a personal task, which belongs to `ownerEmployeeId` instead (0233). */
  positionId: string | null;
  /** The seat's title, or "Personal JD" for a personal task. */
  positionTitle: string;
  /** Set on a PERSONAL task — the one person it belongs to. */
  ownerEmployeeId?: string | null;
  ownerName?: string | null;
  functionKey: string;
  task: string;
  /** Shown as SUBJECT — the WMS Tasks roster (Admin Panel → Subjects). */
  category: string | null;
  /** From the WMS Tasks client roster (migration 0237). Null until it runs. */
  client: string | null;
  /** The Notes column. Written by the form since day one and, until now, never
   *  read back — so every note anyone typed was invisible everywhere. */
  notesHtml: string | null;
  recurrence: Recurrence;
  estimatedMinutes: number;
  videoUrl: string | null;
  guidelinesUrl: string | null;
  templateUrl: string | null;
  pushDcc: boolean;
  pushWms: boolean;
  pushEvent: boolean;
  isActive: boolean;
  /** Names of the people this JD is explicitly assigned to, across every
   *  destination, once each — what the Bank's Add To Person column shows. */
  assignees: string[];
  /** Employee IDS per destination — what the three assignment boxes hold.
   *  Names are for reading, ids are for editing, and the two are kept apart so
   *  a rename cannot silently unassign somebody. */
  targetPeople: TargetPeople;
  /** SOP FILES uploaded into the form's three boxes (jd_attachments), oldest
   *  first. Optional so hand-built rows (demo data, tests) need not carry it.
   *  Opened through /api/jd/attachments/<id>, which signs a link per click. */
  files?: JdFileRow[];
  /** The event checklists this JD is a row in (the Event Checklist box's
   *  ticks). Filled by loadJdBank from listJdEventLinks. */
  eventRunIds?: string[];
  /** Doer Notes by employee id — what each person doing it wrote against it.
   *  Filled by loadJdBank from listJdDoerNotes. */
  doerNotes?: Record<string, string>;
}

/** An event checklist a JD can be put into — one option in the Event Checklist box. */
export interface JdEventOption {
  /** The checklist RUN's id — the JD becomes a row in it. */
  id: string;
  /** The event's name ("PSO Nashik"), else the checklist's own title. */
  title: string;
  eventDate: string | null;
}

/** One uploaded SOP file, as the Bank and the drawer list it. */
export interface JdFileRow {
  id: string;
  kind: JdAttachmentKind;
  fileName: string;
  sizeBytes: number | null;
}

/** The ladder, lowest rank first. */
export async function listRanks(): Promise<JdRankRow[]> {
  return db
    .select({
      id: jdRanks.id,
      name: jdRanks.name,
      rankOrder: jdRanks.rankOrder,
      band: jdRanks.band,
    })
    .from(jdRanks)
    .where(eq(jdRanks.isActive, true))
    .orderBy(asc(jdRanks.rankOrder));
}

/**
 * Every seat, with its holder count.
 *
 * The count is what lets the form show "Operations · Executive (2)" — so the
 * author can see a seat is EMPTY before saving a job into it, rather than
 * discovering weeks later that everything filed there escalated to a manager.
 */
export async function listPositions(): Promise<JdPositionRow[]> {
  const rows = await db
    .select({
      id: jdPositions.id,
      functionKey: jdPositions.functionKey,
      rankId: jdPositions.rankId,
      rankName: jdRanks.name,
      rankOrder: jdRanks.rankOrder,
      variant: jdPositions.variant,
      title: jdPositions.title,
      holderCount: sql<number>`(
        select count(*)::int
        from ${jdPositionHolders}
        join ${employees} on ${employees.id} = ${jdPositionHolders.employeeId}
        where ${jdPositionHolders.positionId} = ${jdPositions.id}
          and ${jdPositionHolders.isActive} = true
          and ${employees.isActive} = true
      )`,
    })
    .from(jdPositions)
    .innerJoin(jdRanks, eq(jdRanks.id, jdPositions.rankId))
    .where(eq(jdPositions.isActive, true))
    .orderBy(asc(jdPositions.functionKey), asc(jdRanks.rankOrder));

  return rows;
}

/** The JD Bank, optionally narrowed to one function. */
export async function listJdEntries(opts?: {
  functionKey?: BusinessFunction | null;
  includeInactive?: boolean;
}): Promise<JdEntryRow[]> {
  const where = [] as ReturnType<typeof eq>[];
  if (!opts?.includeInactive) where.push(eq(jdEntries.isActive, true));
  if (opts?.functionKey) where.push(eq(jdEntries.functionKey, opts.functionKey));

  const fields = {
      id: jdEntries.id,
      serialNo: jdEntries.serialNo,
      positionId: jdEntries.positionId,
      positionTitle: sql<string>`coalesce(${jdPositions.title}, 'Personal JD')`,
      ownerEmployeeId: jdEntries.ownerEmployeeId,
      ownerName: sql<string | null>`(select ${employees.name} from ${employees} where ${employees.id} = ${jdEntries.ownerEmployeeId})`,
      functionKey: jdEntries.functionKey,
      task: jdEntries.task,
      category: jdEntries.category,
      notesHtml: jdEntries.notesHtml,
      recurrence: jdEntries.recurrence,
      estimatedMinutes: jdEntries.estimatedMinutes,
      videoUrl: jdEntries.videoUrl,
      guidelinesUrl: jdEntries.guidelinesUrl,
      templateUrl: jdEntries.templateUrl,
      pushDcc: jdEntries.pushDcc,
      pushWms: jdEntries.pushWms,
      pushEvent: jdEntries.pushEvent,
      isActive: jdEntries.isActive,
      assignees: sql<string[]>`coalesce((
        select array_agg(${employees.name} order by ${employees.name})
        from ${jdAssignments}
        join ${employees} on ${employees.id} = ${jdAssignments.employeeId}
        where ${jdAssignments.jdId} = ${jdEntries.id}
          and ${jdAssignments.isActive} = true
      ), '{}')`,
      /* One sub-select per destination. Ordered by NAME so the three boxes read
         the way the roster does, even though what comes back is ids. */
      dccIds: sql<string[]>`coalesce((
        select array_agg(${jdAssignments.employeeId} order by ${employees.name})
        from ${jdAssignments}
        join ${employees} on ${employees.id} = ${jdAssignments.employeeId}
        where ${jdAssignments.jdId} = ${jdEntries.id}
          and ${jdAssignments.isActive} = true
          and ${jdAssignments.forDcc} = true
      ), '{}')`,
      wmsIds: sql<string[]>`coalesce((
        select array_agg(${jdAssignments.employeeId} order by ${employees.name})
        from ${jdAssignments}
        join ${employees} on ${employees.id} = ${jdAssignments.employeeId}
        where ${jdAssignments.jdId} = ${jdEntries.id}
          and ${jdAssignments.isActive} = true
          and ${jdAssignments.forWms} = true
      ), '{}')`,
      eventIds: sql<string[]>`coalesce((
        select array_agg(${jdAssignments.employeeId} order by ${employees.name})
        from ${jdAssignments}
        join ${employees} on ${employees.id} = ${jdAssignments.employeeId}
        where ${jdAssignments.jdId} = ${jdEntries.id}
          and ${jdAssignments.isActive} = true
          and ${jdAssignments.forEvent} = true
      ), '{}')`,
      files: sql<JdFileRow[]>`coalesce((
        select json_agg(json_build_object(
          'id', a.id, 'kind', a.kind, 'fileName', a.file_name, 'sizeBytes', a.size_bytes
        ) order by a.created_at)
        from ${jdAttachments} a
        where a.jd_id = ${jdEntries.id}
      ), '[]'::json)`,
  };
  const read = (f: typeof fields) =>
    db
      .select(f)
      .from(jdEntries)
      // LEFT: a personal task has no position (0233).
      .leftJoin(jdPositions, eq(jdPositions.id, jdEntries.positionId))
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(asc(jdEntries.serialNo));

  /* `client` arrives with migration 0237, applied by hand. Until it runs the
     Bank still opens — every Client reads blank — rather than falling back to
     the demo data over one missing column. */
  type Row = Awaited<ReturnType<typeof read>>[number] & { client?: string | null };
  let rows: Row[];
  try {
    rows = (await read({ ...fields, client: jdEntries.client } as typeof fields)) as Row[];
  } catch (e) {
    if (!isMissingJdTable(e)) throw e;
    rows = await read(fields);
  }

  return rows.map(({ dccIds, wmsIds, eventIds, ...r }) => ({
    ...r,
    client: r.client ?? null,
    // The jsonb column is free-form to Postgres, so a row written by a future
    // version must not crash the Bank — fall back rather than throw.
    recurrence: readRecurrence(r.recurrence),
    assignees: r.assignees ?? [],
    files: Array.isArray(r.files) ? r.files : [],
    targetPeople: {
      dcc: dccIds ?? [],
      wms: wmsIds ?? [],
      event: eventIds ?? [],
    },
  }));
}

/** One JD by id. */
export async function getJdEntry(id: string): Promise<JdEntryRow | null> {
  const rows = await listJdEntries({ includeInactive: true });
  return rows.find((r) => r.id === id) ?? null;
}

/** Active staff, for the Assigned Person(s) picker. */
export async function listJdPeople(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

/**
 * Who sits in which seat — active holders who are active employees.
 *
 * The page never loaded these on real data, so every seat read as vacant and
 * "who does it" could not resolve. The Person JD view is where a person is
 * placed in a seat (setJdPositionHolder).
 */
export async function listJdHolders(): Promise<{ positionId: string; employeeId: string; name: string }[]> {
  return db
    .select({ positionId: jdPositionHolders.positionId, employeeId: jdPositionHolders.employeeId, name: employees.name })
    .from(jdPositionHolders)
    .innerJoin(employees, eq(employees.id, jdPositionHolders.employeeId))
    .where(and(eq(jdPositionHolders.isActive, true), eq(employees.isActive, true)))
    .orderBy(asc(employees.name));
}

/** Everything one person is answerable for — their individual Job Description. */
export async function listJdForEmployee(employeeId: string): Promise<JdEntryRow[]> {
  const ids = await db
    .select({ jdId: jdAssignments.jdId })
    .from(jdAssignments)
    .where(and(eq(jdAssignments.employeeId, employeeId), eq(jdAssignments.isActive, true)));

  if (ids.length === 0) return [];
  const set = new Set(ids.map((r) => r.jdId));
  const all = await listJdEntries();
  return all.filter((r) => set.has(r.id));
}

/**
 * The live EVENT CHECKLISTS, soonest first — what the Event Checklist box on
 * the JD form lists (2026-09-18: event names, not employees). Standing lists
 * (Monthly Close) are not events, and a completed or cancelled event takes no
 * new rows.
 */
export async function listJdEventOptions(): Promise<JdEventOption[]> {
  const rows = await db
    .select({
      id: opsChecklistRuns.id,
      runTitle: opsChecklistRuns.title,
      eventTitle: calendarEvents.title,
      eventDate: opsChecklistRuns.eventDate,
    })
    .from(opsChecklistRuns)
    .leftJoin(calendarEvents, eq(calendarEvents.id, opsChecklistRuns.eventId))
    .where(and(eq(opsChecklistRuns.isEvent, true), eq(opsChecklistRuns.status, "active")))
    .orderBy(asc(opsChecklistRuns.eventDate), asc(opsChecklistRuns.title));
  return rows.map((r) => ({ id: r.id, title: r.eventTitle ?? r.runTitle, eventDate: r.eventDate }));
}

/** JD id → the event checklists it is a live row in. */
export async function listJdEventLinks(): Promise<Map<string, string[]>> {
  const rows = await db
    .selectDistinct({ jdId: opsChecklistItems.jdEntryId, runId: opsChecklistItems.runId })
    .from(opsChecklistItems)
    .where(
      and(
        isNotNull(opsChecklistItems.jdEntryId),
        isNotNull(opsChecklistItems.runId),
        eq(opsChecklistItems.isActive, true),
      ),
    );
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.jdId || !r.runId) continue;
    const list = out.get(r.jdId);
    if (list) list.push(r.runId);
    else out.set(r.jdId, [r.runId]);
  }
  return out;
}

/**
 * Every Doer Note, as jdId → (employeeId → note). Migration 0237 — the caller
 * treats a missing table as "no notes yet".
 */
export async function listJdDoerNotes(): Promise<Map<string, Record<string, string>>> {
  const rows = await db
    .select({ jdId: jdDoerNotes.jdId, employeeId: jdDoerNotes.employeeId, notes: jdDoerNotes.notes })
    .from(jdDoerNotes);
  const out = new Map<string, Record<string, string>>();
  for (const r of rows) {
    if (!r.notes) continue;
    const m = out.get(r.jdId) ?? {};
    m[r.employeeId] = r.notes;
    out.set(r.jdId, m);
  }
  return out;
}
