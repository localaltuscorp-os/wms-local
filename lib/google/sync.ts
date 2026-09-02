import "server-only";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
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
 * Reconcile a task's Google Calendar event to its current state. Idempotent
 * and best-effort — any failure is logged, never thrown, so it can run inside
 * `after()` without affecting the task save.
 *
 * Handles create, update, reassign (move between doers' calendars), and
 * archive (remove). A doer who hasn't connected Google simply doesn't sync.
 */
export async function reconcileTaskEvent(taskId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  try {
    const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
    if (!t) return;

    const eventId = t.googleEventId;
    const syncedDoer = t.googleSyncedDoerId;

    // Archived → tear down any existing event, clear the pointers.
    if (t.archived) {
      if (eventId && syncedDoer) {
        const tok = await doerToken(syncedDoer);
        if (tok) await deleteEvent(tok, eventId).catch(() => {});
      }
      if (eventId) await clearPointers(taskId);
      return;
    }

    // Reassigned → remove the event from the previous doer's calendar first.
    if (eventId && syncedDoer && syncedDoer !== t.doerId) {
      const oldTok = await doerToken(syncedDoer);
      if (oldTok) await deleteEvent(oldTok, eventId).catch(() => {});
    }

    const tok = await doerToken(t.doerId);
    if (!tok) {
      // Current doer isn't connected. Drop any stale pointer from the old doer.
      if (eventId && syncedDoer !== t.doerId) await clearPointers(taskId);
      return;
    }

    const ct = toCalendarTask(t);
    if (eventId && syncedDoer === t.doerId) {
      await updateEvent(tok, eventId, ct);
    } else {
      const newId = await createEvent(tok, ct);
      await db
        .update(tasks)
        .set({ googleEventId: newId, googleSyncedDoerId: t.doerId })
        .where(eq(tasks.id, taskId));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[google-sync] reconcile failed", taskId, err instanceof Error ? err.message : err);
  }
}

/**
 * Terminal/closed statuses we don't seed onto the calendar during a backfill —
 * a freshly-connected calendar shouldn't fill with months of completed work.
 * (Live `reconcileTaskEvent` still keeps a task's event in sync if it later
 * moves into one of these — backfill is only about the initial bulk seed.)
 */
const BACKFILL_SKIP_STATUSES = [
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

/**
 * One-time bulk seed: push all of a doer's active (non-archived, non-terminal)
 * tasks onto their freshly-connected calendar. Reuses `reconcileTaskEvent` per
 * task, so already-synced tasks are updated rather than duplicated — it's safe
 * to run repeatedly (the "Sync now" button does exactly that).
 *
 * Returns how many tasks were attempted vs. how many actually carry a calendar
 * event afterwards, so the caller can surface a meaningful count.
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

  // Sequential, not parallel: a backfill is best-effort background work and we
  // don't want to burst Google's rate limit with one request per task.
  for (const { id } of rows) {
    await reconcileTaskEvent(id); // never throws — logs internally
  }

  // Count how many of those candidates now actually hold an event id.
  const seeded = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(candidateWhere, isNotNull(tasks.googleEventId)));

  return { attempted: rows.length, synced: seeded.length };
}

/** Delete a task's event — call BEFORE hard-deleting the row (which loses the
 *  pointers). Best-effort. */
export async function removeTaskEvent(t: {
  googleEventId: string | null;
  googleSyncedDoerId: string | null;
}): Promise<void> {
  if (!isGoogleConfigured() || !t.googleEventId || !t.googleSyncedDoerId) return;
  try {
    const tok = await doerToken(t.googleSyncedDoerId);
    if (tok) await deleteEvent(tok, t.googleEventId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[google-sync] remove failed", err instanceof Error ? err.message : err);
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
