import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, employees, tasks } from "@/lib/db";
import { PENDING_STATUSES, type TaskStatus } from "@/db/enums";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A single overdue task row, joined with its doer's name so the digest
 * can render "Jane: 'Send NOC' — 4 days overdue" without a second trip.
 */
export interface OverdueTask {
  id: string;
  shortId: string | null;
  subject: string;
  dueAt: Date;
  doerId: string;
  doerName: string;
  daysOverdue: number;
}

/**
 * Single-query fetch of every overdue, pending, non-archived task in the
 * system, grouped by doer.  Used by the daily digest cron (M2.3).
 *
 * "Overdue" = `status IN PENDING_STATUSES AND due_at IS NOT NULL AND
 * due_at < now() AND archived = false AND employees.is_active = true`.
 *
 * The doer-name join means we do NOT N+1 by employee; the caller can
 * iterate the returned Map and ship one email per employee with all
 * their overdue tasks attached.
 *
 * `subject` falls back to the task title when the optional subject
 * column is null — every task has a title so the digest never renders
 * "" for an item.
 */
export async function listOverdueByEmployee(
  now: Date = new Date(),
): Promise<Map<string, OverdueTask[]>> {
  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      // Overdue is keyed off the EFFECTIVE due (revised ?? original).
      dueAt: effectiveDueAtSql(),
      doerId: tasks.doerId,
      doerName: employees.name,
    })
    .from(tasks)
    .innerJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        inArray(
          tasks.status,
          PENDING_STATUSES as unknown as readonly TaskStatus[],
        ),
        isNotNull(tasks.dueAt),
        lt(effectiveDueAtSql(), now),
        eq(tasks.archived, false),
        eq(employees.isActive, true),
      ),
    )
    .orderBy(sql`${effectiveDueAtSql()} ASC`);

  const map = new Map<string, OverdueTask[]>();
  for (const r of rows) {
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - r.dueAt.getTime()) / MS_PER_DAY),
    );
    const row: OverdueTask = {
      id: r.id,
      shortId: r.shortId,
      subject: r.subject && r.subject.trim().length > 0 ? r.subject : r.title,
      dueAt: r.dueAt,
      doerId: r.doerId,
      doerName: r.doerName,
      daysOverdue,
    };
    const bucket = map.get(r.doerId);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(r.doerId, [row]);
    }
  }
  return map;
}

/** A pending task row for the daily digest. Overdue ones carry isOverdue=true. */
export interface PendingTask {
  id: string;
  shortId: string | null;
  subject: string;
  dueAt: Date | null;
  doerId: string;
  doerName: string;
  isOverdue: boolean;
  daysOverdue: number;
}

/** Raw selected columns before shaping — exported for unit testing. */
export interface PendingQueryRow {
  id: string;
  shortId: string | null;
  title: string;
  subject: string | null;
  dueAt: Date | null;
  doerId: string;
  doerName: string;
}

/**
 * Pure transform: group raw rows by doer, compute isOverdue/daysOverdue,
 * fall back to title for empty subjects, and sort each bucket overdue-first
 * then by dueAt asc (nulls last). Exported so it's unit testable without a DB.
 */
export function shapePendingRows(
  rows: PendingQueryRow[],
  now: Date,
): Map<string, PendingTask[]> {
  const map = new Map<string, PendingTask[]>();
  for (const r of rows) {
    const overdue = r.dueAt != null && r.dueAt.getTime() < now.getTime();
    const task: PendingTask = {
      id: r.id,
      shortId: r.shortId,
      subject: r.subject && r.subject.trim().length > 0 ? r.subject : r.title,
      dueAt: r.dueAt,
      doerId: r.doerId,
      doerName: r.doerName,
      isOverdue: overdue,
      daysOverdue: overdue
        ? Math.max(0, Math.floor((now.getTime() - r.dueAt!.getTime()) / MS_PER_DAY))
        : 0,
    };
    const bucket = map.get(r.doerId);
    if (bucket) bucket.push(task);
    else map.set(r.doerId, [task]);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.dueAt == null && b.dueAt == null) return 0;
      if (a.dueAt == null) return 1;
      if (b.dueAt == null) return -1;
      return a.dueAt.getTime() - b.dueAt.getTime();
    });
  }
  return map;
}

/**
 * Every pending (non-done, non-archived) task assigned to an active employee,
 * grouped by doer. Used by the 10am daily digest cron. Unlike
 * listOverdueByEmployee, this does NOT filter on due_at — full pending workload,
 * overdue items flagged.
 */
export async function listPendingByEmployee(
  now: Date = new Date(),
): Promise<Map<string, PendingTask[]>> {
  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      // Effective due so shapePendingRows flags overdue from the revision.
      dueAt: effectiveDueAtSql(),
      doerId: tasks.doerId,
      doerName: employees.name,
    })
    .from(tasks)
    .innerJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        inArray(tasks.status, PENDING_STATUSES as unknown as readonly TaskStatus[]),
        eq(tasks.archived, false),
        eq(employees.isActive, true),
      ),
    );
  return shapePendingRows(rows as PendingQueryRow[], now);
}
