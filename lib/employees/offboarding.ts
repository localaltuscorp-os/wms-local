import { and, eq, inArray, not, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { employees, tasks } from "@/db/schema";
import { getSupabaseAdmin, AVATARS_BUCKET } from "@/lib/supabase/admin";

/**
 * OFFBOARDING MECHANICS — the pieces `archiveEmployee` composes.
 *
 * The governing rule for everything in this file: an exit deletes an IDENTITY
 * and re-homes OBLIGATIONS. It never deletes a record of what happened.
 */

/**
 * Statuses that mean the task is finished and needs nobody.
 *
 * Reassignment must skip these. A completed task carries the name of whoever
 * completed it as a matter of historical fact — moving `doer_id` on a done task
 * would rewrite the record to claim the successor did work they never did.
 * Only LIVE obligations move.
 *
 * `transferred` and `cancelled` are legacy terminal values still present in
 * imported data; they are equally finished.
 */
const TERMINAL_TASK_STATUSES = [
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

/** What an archive moved, by kind. Persisted to `employee_exits.reassigned`. */
export interface ReassignmentCounts {
  openTasks: number;
  directReports: number;
  oooDelegations: number;
  /**
   * What was left dangling because no successor was named. Recorded rather
   * than hidden: an exit that stranded 3 live tasks should say so on the
   * record, not report a tidy zero.
   */
  unassignedTasks: number;
  orphanedReports: number;
}

// A transaction handle from `db.transaction(...)`. Typed loosely on purpose:
// the concrete generic is enormous and adds nothing here.
type Tx = PgTransaction<any, any, any>;

/**
 * Move every LIVE obligation from the departing employee to their successor.
 *
 * WHAT MOVES — and, more importantly, what does not:
 *
 *  · `tasks.doer_id` on non-terminal tasks. A live obligation must land on
 *    somebody, or it silently stops being anyone's job.
 *
 *  · `employees.manager_id` for their direct reports. People cannot report to
 *    a former employee; leaving this dangling breaks every approval chain that
 *    walks upward from the report.
 *
 *  · `employees.ooo_delegate_id` pointing AT them is cleared rather than
 *    moved. Delegation is a personal choice by the person who set it, not an
 *    obligation to inherit — silently repointing it at a stranger would route
 *    someone's out-of-office work to a person they never nominated.
 *
 * WHAT NEVER MOVES:
 *
 *  · `tasks.initiator_id` and `tasks.created_by_id` — historical facts. Who
 *    asked for the work, and who typed it in, happened. Rewriting them to the
 *    successor would forge the record.
 *
 *  · Goals. A goal is a personal objective with a personal score; handing it
 *    to someone else would corrupt both their appraisal and the departing
 *    person's history. They are counted so the admin can see what was left
 *    behind, and left alone.
 *
 * With no successor the function is a no-op that still reports the counts, so
 * the exit record can honestly say "3 open tasks, nowhere to put them".
 */
export async function reassignOpenWork(
  tx: Tx,
  employeeId: string,
  successorId: string | null,
): Promise<ReassignmentCounts> {
  const openTaskFilter = and(
    eq(tasks.doerId, employeeId),
    not(inArray(tasks.status, [...TERMINAL_TASK_STATUSES])),
  );

  if (!successorId) {
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(openTaskFilter);
    const [reports] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.managerId, employeeId));
    return {
      openTasks: 0,
      directReports: 0,
      oooDelegations: 0,
      // Report what was NOT handled, so the record is honest about it.
      unassignedTasks: Number(open?.n ?? 0),
      orphanedReports: Number(reports?.n ?? 0),
    };
  }

  const movedTasks = await tx
    .update(tasks)
    .set({ doerId: successorId })
    .where(openTaskFilter)
    .returning({ id: tasks.id });

  const movedReports = await tx
    .update(employees)
    .set({ managerId: successorId })
    .where(eq(employees.managerId, employeeId))
    .returning({ id: employees.id });

  const clearedDelegations = await tx
    .update(employees)
    .set({ oooDelegateId: null })
    .where(eq(employees.oooDelegateId, employeeId))
    .returning({ id: employees.id });

  return {
    openTasks: movedTasks.length,
    directReports: movedReports.length,
    oooDelegations: clearedDelegations.length,
    unassignedTasks: 0,
    orphanedReports: 0,
  };
}

/**
 * Destroy the avatar image and every reference to it, immediately on archive.
 *
 * Requested explicitly, and it is the right default: a face is the most
 * identifying thing on the record and the least useful one to keep. It also
 * has no statutory retention basis — nothing in labour law requires you to
 * keep a photograph — so there is no reason to wait for the retention clock.
 *
 * Deletes the STORAGE OBJECTS (the whole `<employeeId>/` folder, which may hold
 * superseded uploads) and nulls both columns. Best-effort on the storage side:
 * the DB is the source of truth for whether an avatar exists, so a failed
 * object delete leaves an orphaned blob, not a broken record. It returns
 * whether the blob removal actually succeeded so `employee_exits.avatar_purged`
 * does not claim more than happened.
 */
export async function purgeAvatar(tx: Tx, employeeId: string): Promise<boolean> {
  await tx
    .update(employees)
    .set({ avatarUrl: null, avatarPath: null })
    .where(eq(employees.id, employeeId));

  try {
    const admin = getSupabaseAdmin();
    const { data: list } = await admin.storage.from(AVATARS_BUCKET).list(employeeId);
    const paths = (list ?? []).map((f) => `${employeeId}/${f.name}`);
    if (paths.length === 0) return true;
    const { error } = await admin.storage.from(AVATARS_BUCKET).remove(paths);
    return !error;
  } catch {
    return false;
  }
}

/**
 * The placeholder identity a row takes on once retention expires.
 *
 * Deliberately keeps a stable, human-readable handle rather than a bare UUID:
 * someone reading a five-year-old audit trail needs to see that two events
 * share an actor, and "Former Employee 3f9c" says that where "null" does not.
 *
 * The email must stay UNIQUE (the column is unique) and must not resemble a
 * deliverable address, so nothing can ever mail it by accident.
 */
export function anonymisedIdentity(employeeId: string): {
  name: string;
  email: string;
} {
  const short = employeeId.replace(/-/g, "").slice(0, 8);
  return {
    name: `Former Employee ${short.slice(0, 4).toUpperCase()}`,
    email: `anonymised+${short}@invalid.local`,
  };
}
