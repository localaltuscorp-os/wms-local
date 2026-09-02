import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, tcSessions, tcSessionAttendees } from "@/lib/db";

/**
 * Knowledge-Sharing seam — the ONE place the Appraisal module reaches into the
 * Training Centre. The Knowledge Sharing dimension is AUTO (do-N / give-N rule
 * in appraisal_config.knowledgeSharingRule); this computes the two raw counts
 * for an employee in a period from the Training tables:
 *
 *   done  = sessions the employee ATTENDED    (tc_session_attendees.status =
 *           'attended', on a 'done' session in the month)
 *   given = sessions the employee DELIVERED   (tc_sessions.trainer_id = them,
 *           status 'done', in the month)
 *
 * It is defensive by design: if the Training tables are empty or anything
 * throws, it returns zeros with wired=false so the appraisal flow never breaks
 * and the admin can still hand-enter counts. When Training is populated the
 * numbers flow through automatically.
 */

export interface KnowledgeSharingCounts {
  done: number;
  given: number;
  /** false → nothing found / query failed; the caller may keep manual meta. */
  wired: boolean;
}

/** The [start, end) UTC window for a 'YYYY-MM' period. */
function monthWindow(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return {
    start: new Date(Date.UTC(y, mo - 1, 1)),
    end: new Date(Date.UTC(y, mo, 1)),
  };
}

/**
 * Compute the attended (`done`) + delivered (`given`) session counts for an
 * employee within a 'YYYY-MM' period. Safe on any failure.
 */
export async function computeKnowledgeSharing(
  employeeId: string,
  period: string,
): Promise<KnowledgeSharingCounts> {
  const win = monthWindow(period);
  if (!win) return { done: 0, given: 0, wired: false };

  try {
    const [attended] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tcSessionAttendees)
      .innerJoin(tcSessions, eq(tcSessions.id, tcSessionAttendees.sessionId))
      .where(
        and(
          eq(tcSessionAttendees.employeeId, employeeId),
          eq(tcSessionAttendees.status, "attended"),
          eq(tcSessions.status, "done"),
          gte(tcSessions.scheduledAt, win.start),
          lt(tcSessions.scheduledAt, win.end),
        ),
      );

    const [delivered] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tcSessions)
      .where(
        and(
          eq(tcSessions.trainerId, employeeId),
          eq(tcSessions.status, "done"),
          gte(tcSessions.scheduledAt, win.start),
          lt(tcSessions.scheduledAt, win.end),
        ),
      );

    const done = attended?.n ?? 0;
    const given = delivered?.n ?? 0;
    return { done, given, wired: done > 0 || given > 0 };
  } catch {
    // Training not migrated / query failed — keep the manual seam alive.
    return { done: 0, given: 0, wired: false };
  }
}
