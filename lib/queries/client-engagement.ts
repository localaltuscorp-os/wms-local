import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ceAccounts,
  ceAuditLog,
  ceEngagements,
  ceReferences,
  ceTeamMembers,
  employees,
  paCalls,
  paEntries,
  paPeople,
} from "@/db/schema";

/**
 * CLIENT ENGAGEMENT — the reads (rebuild, 0238).
 *
 * Every page loads the same snapshot: the roster, every account, every
 * engagement and every reference. The module is small (tens to low hundreds of
 * rows) and every view is a different cut of the same week, so one load and
 * pure aggregation (lib/client-engagement/grids) beats a query per widget — and
 * the views cannot disagree about a number.
 */

export interface CeMemberRow {
  id: string;
  name: string;
  employeeId: string | null;
  employeeName: string | null;
  email: string | null;
  role: string;
  activeClientLimit: number;
  isActive: boolean;
  sortOrder: number;
}

export interface CeAccountRow {
  id: string;
  fullName: string;
  organization: string | null;
  category: string;
  batchCode: string | null;
  assignedTo: string | null;
  lifecycleStatus: string;
  hhStatus: string;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  notes: string | null;
  updatedAt: string;
}

export interface CeEngagementRow {
  id: string;
  accountId: string;
  teamMemberId: string;
  callType: string;
  dayOfWeek: string;
  /** "HH:MM". */
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

export interface CeReferenceRow {
  id: string;
  accountId: string;
  collectorId: string | null;
  targetProgram: string;
  targetCount: number;
  actualCollected: number;
  frequency: string;
  dueDate: string | null;
  notes: string | null;
}

export interface CeAuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

export interface CeSnapshot {
  members: CeMemberRow[];
  accounts: CeAccountRow[];
  engagements: CeEngagementRow[];
  references: CeReferenceRow[];
}

/** "10:00:00" → "10:00". */
const hm = (t: string | null): string => (t ?? "").slice(0, 5);

/**
 * Has migration 0238 been applied? The pages show a plain notice instead of an
 * error until it has.
 */
export async function ceReady(): Promise<boolean> {
  try {
    await db.select({ id: ceAccounts.id }).from(ceAccounts).limit(1);
    await db.select({ id: ceTeamMembers.id }).from(ceTeamMembers).limit(1);
    return true;
  } catch {
    return false;
  }
}

export async function listCeMembers(opts: { includeInactive?: boolean } = {}): Promise<CeMemberRow[]> {
  const rows = await db
    .select({
      id: ceTeamMembers.id,
      name: ceTeamMembers.name,
      employeeId: ceTeamMembers.employeeId,
      employeeName: employees.name,
      email: ceTeamMembers.email,
      role: ceTeamMembers.role,
      activeClientLimit: ceTeamMembers.activeClientLimit,
      isActive: ceTeamMembers.isActive,
      sortOrder: ceTeamMembers.sortOrder,
    })
    .from(ceTeamMembers)
    .leftJoin(employees, eq(employees.id, ceTeamMembers.employeeId))
    .where(opts.includeInactive ? undefined : eq(ceTeamMembers.isActive, true))
    .orderBy(asc(ceTeamMembers.sortOrder), asc(ceTeamMembers.name));
  return rows;
}

export async function listCeAccounts(): Promise<CeAccountRow[]> {
  const rows = await db.select().from(ceAccounts).orderBy(asc(ceAccounts.fullName));
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    organization: r.organization,
    category: r.category,
    batchCode: r.batchCode,
    assignedTo: r.assignedTo,
    lifecycleStatus: r.lifecycleStatus,
    hhStatus: r.hhStatus,
    startDate: r.startDate,
    endDate: r.endDate,
    tags: r.tags ?? [],
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function listCeEngagements(): Promise<CeEngagementRow[]> {
  const rows = await db
    .select()
    .from(ceEngagements)
    .orderBy(asc(ceEngagements.dayOfWeek), asc(ceEngagements.startTime));
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    teamMemberId: r.teamMemberId,
    callType: r.callType,
    dayOfWeek: r.dayOfWeek,
    startTime: hm(r.startTime),
    endTime: hm(r.endTime),
    startDate: r.startDate,
    endDate: r.endDate,
    notes: r.notes,
  }));
}

export async function listCeReferences(): Promise<CeReferenceRow[]> {
  const rows = await db.select().from(ceReferences).orderBy(asc(ceReferences.createdAt));
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    collectorId: r.collectorId,
    targetProgram: r.targetProgram,
    targetCount: r.targetCount,
    actualCollected: r.actualCollected,
    frequency: r.frequency,
    dueDate: r.dueDate,
    notes: r.notes,
  }));
}

export async function getCeSnapshot(): Promise<CeSnapshot> {
  const [members, accounts, engagements, references] = await Promise.all([
    listCeMembers(),
    listCeAccounts(),
    listCeEngagements(),
    listCeReferences(),
  ]);
  return { members, accounts, engagements, references };
}

/** The most recent changes, newest first — optionally for one record. */
export async function listCeAudit(opts: { limit?: number; entityId?: string } = {}): Promise<CeAuditRow[]> {
  const rows = await db
    .select({
      id: ceAuditLog.id,
      entityType: ceAuditLog.entityType,
      entityId: ceAuditLog.entityId,
      action: ceAuditLog.action,
      summary: ceAuditLog.summary,
      actorName: employees.name,
      createdAt: ceAuditLog.createdAt,
    })
    .from(ceAuditLog)
    .leftJoin(employees, eq(employees.id, ceAuditLog.actorId))
    .where(opts.entityId ? eq(ceAuditLog.entityId, opts.entityId) : undefined)
    .orderBy(desc(ceAuditLog.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/* ── The Hand-holding overlay ─────────────────────────────────────────── */

export interface HhOverlayCall {
  id: string;
  entryName: string;
  section: string | null;
  callType: string;
  dayOfWeek: string;
  durationMin: number;
  /** "HH:MM", or null for a Hand-holding call that was never given a clock. */
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * The Hand-holding weekly calls held by this employee, READ-ONLY, so the
 * calendar's picture of someone's week includes the work Hand-holding already
 * gave them. Joined through pa_people.employee_id; archived and on-hold entries
 * are left out, as Hand-holding's own calendar leaves them out.
 */
export async function listHhOverlay(employeeId: string): Promise<HhOverlayCall[]> {
  try {
    const rows = await db
      .select({
        id: paCalls.id,
        entryName: paEntries.name,
        section: paEntries.section,
        callType: paCalls.callType,
        day: paCalls.day,
        durationMin: paCalls.durationMin,
        startTime: paCalls.startTime,
        endTime: paCalls.endTime,
        startDate: paEntries.startDate,
        endDate: paEntries.endDate,
      })
      .from(paCalls)
      .innerJoin(paEntries, eq(paEntries.id, paCalls.entryId))
      .innerJoin(paPeople, eq(paPeople.id, paEntries.personId))
      .where(
        and(
          eq(paPeople.employeeId, employeeId),
          eq(paEntries.onHold, false),
          isNull(paEntries.archivedAt),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      entryName: r.entryName,
      section: r.section,
      callType: r.callType,
      dayOfWeek: r.day,
      durationMin: r.durationMin,
      startTime: r.startTime ? hm(r.startTime) : null,
      endTime: r.endTime ? hm(r.endTime) : null,
      startDate: r.startDate,
      endDate: r.endDate,
    }));
  } catch (err) {
    // The overlay is a courtesy; Hand-holding being unreachable must not take
    // the calendar down with it.
    console.warn("[client-engagement] HH overlay failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/** Active employees, for linking a team member to a login. */
export async function listLinkableEmployees(): Promise<{ id: string; name: string; email: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name))
    .limit(500);
}
