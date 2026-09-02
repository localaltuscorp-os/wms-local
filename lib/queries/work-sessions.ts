import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  workSessions,
  workSessionShots,
  type WorkSession,
  type WorkSessionShot,
} from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * Read layer for Phase-2 project/remote work sessions. These functions are the
 * ONE place both the employee's own capture page and the (separately built)
 * manager-review page read sessions from — keep them pure, typed and side-effect
 * free so either surface can compose them.
 */

export interface ListSessionsOpts {
  /** Max rows to return (newest first). Defaults to 30. */
  limit?: number;
}

/**
 * Recent work sessions for one employee, newest-started first. Powers the "your
 * recent sessions" list under the capture control and the per-person column of
 * the manager-review page.
 */
export async function listSessionsForEmployee(
  employeeId: string,
  opts: ListSessionsOpts = {},
): Promise<WorkSession[]> {
  const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : 30;
  return db
    .select()
    .from(workSessions)
    .where(eq(workSessions.employeeId, employeeId))
    .orderBy(desc(workSessions.startedAt))
    .limit(limit);
}

/** A single session together with its screenshots (oldest-taken first). */
export interface SessionWithShots {
  session: WorkSession;
  shots: WorkSessionShot[];
}

/**
 * One session plus every screenshot captured during it, oldest-first. Returns
 * `null` when the id matches no session. The manager-review page uses this to
 * render the evidence strip for a picked session.
 */
export async function getSessionWithShots(
  sessionId: string,
): Promise<SessionWithShots | null> {
  const session = await db.query.workSessions.findFirst({
    where: eq(workSessions.id, sessionId),
  });
  if (!session) return null;

  const shots = await db
    .select()
    .from(workSessionShots)
    .where(eq(workSessionShots.sessionId, sessionId))
    .orderBy(workSessionShots.takenAt);

  return { session, shots };
}

/**
 * One project-remote worker with a rolling snapshot of their accountability.
 * `sessionCount` / `totalHours` cover the trailing 30 days (accountability is
 * about recent activity, not lifetime totals). Employees with no sessions in
 * the window still appear (zeroed) so the reviewer sees *everyone* they own.
 */
export interface ProjectRemoteEmployeeStat {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Sessions started in the last 30 days. */
  sessionCount: number;
  /** Total logged hours across those sessions. */
  totalHours: number;
}

/** Days of history the manager-review rollup covers. */
const STATS_WINDOW_DAYS = 30;

/**
 * Every ACTIVE `project_remote` worker with their trailing-30-day session count
 * and total hours, name-sorted. Powers the left-hand person list on the
 * manager-review page. A LEFT JOIN keeps people with zero sessions visible.
 */
export async function listProjectRemoteEmployeesWithSessionStats(): Promise<
  ProjectRemoteEmployeeStat[]
> {
  const since = new Date(Date.now() - STATS_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatarUrl: employees.avatarUrl,
      sessionCount: sql<number>`count(${workSessions.id})`,
      totalMinutes: sql<string>`coalesce(sum(${workSessions.totalMinutes}), 0)`,
    })
    .from(employees)
    .leftJoin(
      workSessions,
      and(
        eq(workSessions.employeeId, employees.id),
        gte(workSessions.startedAt, since),
      ),
    )
    .where(and(eq(employees.workerType, "project_remote"), eq(employees.isActive, true)))
    .groupBy(employees.id, employees.name, employees.avatarUrl)
    .orderBy(employees.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl,
    sessionCount: Number(r.sessionCount) || 0,
    totalHours: (Number(r.totalMinutes) || 0) / 60,
  }));
}

/**
 * Batch-sign screenshot storage paths → `Map(path → signed URL)`. Screenshots
 * live in the private DOCUMENTS bucket, so the review UI can only show them via
 * short-lived signed URLs (regenerated on every page read). A failed sign maps
 * to a missing entry — the UI renders a graceful "unavailable" tile, never a
 * broken image or a crash.
 */
export async function signShotPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return out;
  try {
    const { data } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUrls(unique, 3600);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch {
    /* leave map empty — callers treat a missing url as "unavailable" */
  }
  return out;
}
