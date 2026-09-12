import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jdAssignments,
  jdEntries,
  jdPositions,
  jdPositionHolders,
  jdRanks,
  employees,
} from "@/db/schema";
import { readRecurrence, type Recurrence } from "@/lib/jd/recurrence";
import type { TargetPeople } from "@/lib/jd/assignment-targets";
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
  positionId: string;
  positionTitle: string;
  functionKey: string;
  task: string;
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

  const rows = await db
    .select({
      id: jdEntries.id,
      serialNo: jdEntries.serialNo,
      positionId: jdEntries.positionId,
      positionTitle: jdPositions.title,
      functionKey: jdEntries.functionKey,
      task: jdEntries.task,
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
    })
    .from(jdEntries)
    .innerJoin(jdPositions, eq(jdPositions.id, jdEntries.positionId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(jdEntries.serialNo));

  return rows.map(({ dccIds, wmsIds, eventIds, ...r }) => ({
    ...r,
    // The jsonb column is free-form to Postgres, so a row written by a future
    // version must not crash the Bank — fall back rather than throw.
    recurrence: readRecurrence(r.recurrence),
    assignees: r.assignees ?? [],
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
