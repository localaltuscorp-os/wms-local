import "server-only";
import { and, eq, gt, isNull, isNotNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  isGoogleConfigured,
  type CalendarTask,
} from "./calendar";

/**
 * Google Calendar reconciliation.
 *
 * `reconcileTaskEvent` brings a task's calendar event to its desired state
 * (create / update / reassign / tear-down) and is IDEMPOTENT. It is the single
 * worker used by three callers: the live `afterResponse()` fast-path (instant,
 * best-effort), the durable CRON (`/api/cron/calendar-sync`, the reliable path),
 * and the connect-time backfill.
 *
 * Durability + observability (the fix for the silent-failure bug):
 *  • success  → stamp `calendar_last_sync_at`, clear attempts + error.
 *  • failure  → LOG it (status / message / stack / task id / doer id) and
 *               schedule a retry with exponential backoff. Never throws, so the
 *               cron keeps going and the live save is never affected.
 * The cron self-heals via `listTasksNeedingCalendarSync` (it finds out-of-sync
 * tasks from their actual state — no fragile "dirty flag" to keep correct).
 */

const MAX_ATTEMPTS = 10;

/** Terminal/closed statuses — we never SEED a brand-new event for these (a
 *  freshly-connected or back-synced calendar shouldn't fill with completed
 *  work). Existing events for such tasks are still updated / torn down. */
const SKIP_CREATE_STATUSES = [
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Structured, NEVER-swallowed failure log — the thing the old code lacked. */
function logSyncError(stage: string, taskId: string, doerId: string | null, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  // calendar.ts error messages already embed `<op> failed: <httpStatus> <body>`.
  // eslint-disable-next-line no-console
  console.error(
    `[google-calendar] SYNC FAILED stage=${stage} task=${taskId} doer=${doerId ?? "-"} :: ${e.message}`,
    "\n",
    e.stack ?? "(no stack)",
  );
}

async function recordSuccess(
  taskId: string,
  set: { googleEventId?: string | null; googleSyncedDoerId?: string | null } = {},
): Promise<void> {
  await db
    .update(tasks)
    .set({ ...set, calendarLastSyncAt: new Date(), calendarLastError: null, calendarAttempts: 0, calendarNextAttemptAt: null })
    .where(eq(tasks.id, taskId))
    .catch((e) => logSyncError("record-success", taskId, null, e));
}

async function recordFailure(taskId: string, prevAttempts: number, err: unknown): Promise<void> {
  const attempts = (prevAttempts ?? 0) + 1;
  const backoffMs = Math.min(2 ** attempts * 30_000, 60 * 60_000); // 1m,2m,4m… capped 1h
  await db
    .update(tasks)
    .set({ calendarAttempts: attempts, calendarLastError: errMessage(err).slice(0, 500), calendarNextAttemptAt: new Date(Date.now() + backoffMs) })
    .where(eq(tasks.id, taskId))
    .catch((e) => logSyncError("record-failure", taskId, null, e));
}

export async function reconcileTaskEvent(taskId: string): Promise<void> {
  if (!isGoogleConfigured()) return;

  let t: typeof tasks.$inferSelect | undefined;
  try {
    t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  } catch (err) {
    // Couldn't even load the row — the cron re-queries from scratch, so it will
    // be retried regardless; just make the failure visible.
    logSyncError("load", taskId, null, err);
    return;
  }
  if (!t) return;

  try {
    const eventId = t.googleEventId;
    const syncedDoer = t.googleSyncedDoerId;

    // ── Archived → tear down the event, clear the pointers. ──
    if (t.archived) {
      if (eventId && syncedDoer) {
        const tok = await doerToken(syncedDoer);
        if (tok) await deleteEvent(tok, eventId);
      }
      await recordSuccess(taskId, { googleEventId: null, googleSyncedDoerId: null });
      return;
    }

    // ── Reassigned → remove from the previous doer's calendar first. ──
    if (eventId && syncedDoer && syncedDoer !== t.doerId) {
      const oldTok = await doerToken(syncedDoer);
      if (oldTok) await deleteEvent(oldTok, eventId).catch(() => {});
    }

    const tok = await doerToken(t.doerId);
    if (!tok) {
      // Current doer hasn't connected Google — nothing to sync now (the cron
      // filters these out, and a connect runs the backfill). Drop any stale
      // pointer left by a previous doer.
      if (eventId && syncedDoer !== t.doerId) await clearPointers(taskId);
      return;
    }

    const ct = toCalendarTask(t);
    if (eventId && syncedDoer === t.doerId) {
      await updateEvent(tok, eventId, ct);
      await recordSuccess(taskId);
    } else {
      // Don't seed a brand-new event for an already-closed task.
      if ((SKIP_CREATE_STATUSES as readonly string[]).includes(t.status)) {
        await recordSuccess(taskId);
        return;
      }
      const newId = await createEvent(tok, ct);
      await recordSuccess(taskId, { googleEventId: newId, googleSyncedDoerId: t.doerId });
    }
  } catch (err) {
    logSyncError("reconcile", taskId, t.doerId, err);
    await recordFailure(taskId, t.calendarAttempts, err);
  }
}

/**
 * Self-healing candidate query for the cron: every task whose calendar event is
 * out of sync with its desired state AND is retry-eligible (backoff elapsed,
 * under the attempt cap). Covers create, update (changed since last sync),
 * reassign (moved doers), and tear-down (archived). Driven by ACTUAL state, not
 * a flag — so tasks the live fast-path missed are still caught here.
 */
export async function listTasksNeedingCalendarSync(limit = 40): Promise<string[]> {
  const retryEligible = and(
    or(isNull(tasks.calendarNextAttemptAt), lte(tasks.calendarNextAttemptAt, sql`now()`)),
    lt(tasks.calendarAttempts, MAX_ATTEMPTS),
  );
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .leftJoin(employees, eq(employees.id, tasks.doerId))
    .where(
      and(
        retryEligible,
        or(
          // tear-down: archived but still has an event
          and(eq(tasks.archived, true), isNotNull(tasks.googleEventId)),
          // reassign: active, has an event, but on the wrong doer's calendar
          and(eq(tasks.archived, false), isNotNull(tasks.googleEventId), sql`${tasks.googleSyncedDoerId} IS DISTINCT FROM ${tasks.doerId}`),
          // create / update: active, non-terminal, doer connected
          and(
            eq(tasks.archived, false),
            isNotNull(employees.googleRefreshToken),
            notInArray(tasks.status, [...SKIP_CREATE_STATUSES]),
            or(
              isNull(tasks.googleEventId), // needs create
              and(eq(tasks.googleSyncedDoerId, tasks.doerId), or(isNull(tasks.calendarLastSyncAt), gt(tasks.updatedAt, tasks.calendarLastSyncAt))), // changed since last sync
            ),
          ),
        ),
      ),
    )
    .orderBy(sql`${tasks.calendarNextAttemptAt} ASC NULLS FIRST`)
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Terminal/closed statuses we don't seed during a backfill.
 */
const BACKFILL_SKIP_STATUSES = SKIP_CREATE_STATUSES;

/**
 * One-time bulk seed: push a doer's active (non-archived, non-terminal) tasks
 * onto their freshly-connected calendar. Idempotent (reuses reconcile).
 */
export async function backfillDoerCalendar(
  doerId: string,
): Promise<{ attempted: number; synced: number }> {
  if (!isGoogleConfigured()) return { attempted: 0, synced: 0 };
  const tok = await doerToken(doerId);
  if (!tok) return { attempted: 0, synced: 0 };

  const candidateWhere = and(
    eq(tasks.doerId, doerId),
    eq(tasks.archived, false),
    notInArray(tasks.status, [...BACKFILL_SKIP_STATUSES]),
  );
  const rows = await db.select({ id: tasks.id }).from(tasks).where(candidateWhere);
  for (const { id } of rows) await reconcileTaskEvent(id); // never throws

  const seeded = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(candidateWhere, isNotNull(tasks.googleEventId)));
  return { attempted: rows.length, synced: seeded.length };
}

/** Delete a task's event — call BEFORE hard-deleting the row. */
export async function removeTaskEvent(t: {
  googleEventId: string | null;
  googleSyncedDoerId: string | null;
}): Promise<void> {
  if (!isGoogleConfigured() || !t.googleEventId || !t.googleSyncedDoerId) return;
  try {
    const tok = await doerToken(t.googleSyncedDoerId);
    if (tok) await deleteEvent(tok, t.googleEventId);
  } catch (err) {
    logSyncError("remove", "(deleted)", t.googleSyncedDoerId, err);
  }
}

async function doerToken(doerId: string): Promise<string | null> {
  const [e] = await db
    .select({ token: employees.googleRefreshToken })
    .from(employees)
    .where(eq(employees.id, doerId))
    .limit(1);
  return e?.token ?? null;
}

async function clearPointers(taskId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ googleEventId: null, googleSyncedDoerId: null })
    .where(eq(tasks.id, taskId));
}

function toCalendarTask(t: typeof tasks.$inferSelect): CalendarTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    subject: t.subject,
    client: t.client,
    dueAt: t.dueAt,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    allDay: t.allDay,
    recurrenceRule: t.recurrenceRule,
  };
}
