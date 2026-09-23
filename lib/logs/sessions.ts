import "server-only";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, type LogoutType } from "@/db/schema";
import { istDateKey, istTodayKey } from "@/lib/logs/ist";

export { istDateKey, istTodayKey };

/**
 * DAILY ACTIVITY SESSIONS — one row per employee per IST calendar date.
 *
 * The only place that writes `daily_sessions`. No user-facing route touches the
 * table directly; login/logout/ingest/finalization all come through here, so the
 * counters and the status cannot drift across call sites.
 *
 * ── IST, NOT SERVER TIME ───────────────────────────────────────────────────
 * A "day" is the IST calendar day (Asia/Kolkata, UTC+05:30). See lib/logs/ist.ts.
 */

export interface SessionCounters {
  events?: number;
  modules?: number;
  pages?: number;
  records?: number;
  actions?: number;
  estimatedMinutes?: number;
}

/**
 * Ensure today's session exists for this employee, stamping the first login the
 * first time it is created. Returns the session id and whether it is new.
 */
export async function ensureDailySession(
  employeeId: string,
  now: Date = new Date(),
): Promise<{ id: string; isNew: boolean }> {
  const dateKey = istDateKey(now);
  const inserted = await db
    .insert(dailySessions)
    .values({
      employeeId,
      dateIst: dateKey,
      firstLoginAt: now,
      lastActivityAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: dailySessions.id });

  if (inserted.length > 0) return { id: inserted[0]!.id, isNew: true };

  const [row] = await db
    .select({ id: dailySessions.id })
    .from(dailySessions)
    .where(
      and(eq(dailySessions.employeeId, employeeId), eq(dailySessions.dateIst, dateKey)),
    );
  return { id: row?.id ?? "", isNew: false };
}

/** Atomically bump a session's counters and move its last-activity stamp. */
export async function touchDailySession(
  sessionId: string,
  deltas: SessionCounters,
  now: Date = new Date(),
): Promise<void> {
  if (!sessionId) return;
  await db
    .update(dailySessions)
    .set({
      lastActivityAt: now,
      updatedAt: now,
      ...(deltas.events
        ? { totalEventCount: sql`${dailySessions.totalEventCount} + ${deltas.events}` }
        : {}),
      ...(deltas.modules
        ? { modulesVisitedCount: sql`${dailySessions.modulesVisitedCount} + ${deltas.modules}` }
        : {}),
      ...(deltas.pages
        ? { pagesVisitedCount: sql`${dailySessions.pagesVisitedCount} + ${deltas.pages}` }
        : {}),
      ...(deltas.records
        ? { recordsViewedCount: sql`${dailySessions.recordsViewedCount} + ${deltas.records}` }
        : {}),
      ...(deltas.actions
        ? { actionsPerformedCount: sql`${dailySessions.actionsPerformedCount} + ${deltas.actions}` }
        : {}),
      ...(deltas.estimatedMinutes
        ? {
            totalEstimatedMinutes: sql`${dailySessions.totalEstimatedMinutes} + ${deltas.estimatedMinutes}`,
          }
        : {}),
    })
    .where(eq(dailySessions.id, sessionId));
}

/** Close a session with a logout type (NORMAL / INACTIVITY_TIMEOUT / …). */
export async function closeDailySession(
  employeeId: string,
  logoutType: LogoutType,
  now: Date = new Date(),
): Promise<void> {
  const dateKey = istDateKey(now);
  await db
    .update(dailySessions)
    .set({
      logoutAt: now,
      logoutType,
      status: "closed",
      updatedAt: now,
    })
    .where(
      and(eq(dailySessions.employeeId, employeeId), eq(dailySessions.dateIst, dateKey)),
    );
}

/**
 * FINALISE EVERY PAST DAY THAT WAS NEVER FINALISED.
 *
 * Runs at/after midnight IST. Closes any session whose date is before today and
 * whose status is not yet `finalized`, stamping NOT_RECORDED where there was no
 * logout event. Idempotent: a re-run after a missed cron touches only rows that
 * are still outstanding. Does NOT log anyone out — the auth session is separate
 * from this rollup.
 */
export async function finalizeStaleDailySessions(
  now: Date = new Date(),
): Promise<{ finalized: number }> {
  const today = istTodayKey(now);
  const updated = await db
    .update(dailySessions)
    .set({
      status: "finalized",
      finalizedAt: now,
      logoutType: sql`coalesce(${dailySessions.logoutType}, 'NOT_RECORDED'::text)`,
      updatedAt: now,
    })
    .where(and(lt(dailySessions.dateIst, today), ne(dailySessions.status, "finalized")))
    .returning({ id: dailySessions.id });

  return { finalized: updated.length };
}
