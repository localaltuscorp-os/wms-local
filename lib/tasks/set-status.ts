import { and, eq, sql } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { taskEvents } from "@/db/schema";
import { TASK_STATUSES, type TaskStatus } from "@/db/enums";
import { canTransitionTo, type ActorRole } from "@/lib/auth/status-transitions";
import { notifyManyForTask } from "@/lib/notifications/dispatch";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { syncTaskToGoal } from "@/lib/weekly-goals/task-sync";
import { afterResponse } from "@/lib/after";
import { emit } from "@/lib/events/emit";
import { taskStatusChanged } from "@/lib/events/task-events";
import { nudgeRelay } from "@/lib/relay/nudge";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optimistic-lock predicate: the row's updatedAt must match what the caller
 *  last saw (millisecond precision — the wire format only carries ms). */
export function optimisticLockMatches(expectedDate: Date) {
  return sql`date_trunc('milliseconds', ${tasks.updatedAt}) = ${expectedDate.toISOString()}::timestamptz`;
}

/**
 * Picks the user-facing label for a task in a notification subject line.
 * Falls back through subject → title → "a task" so we never render an
 * empty string in someone's inbox.
 */
export function taskLabel(t: { subject: string | null; title: string }): string {
  const s = t.subject?.trim();
  if (s) return s;
  const ti = t.title?.trim();
  if (ti) return ti;
  return "a task";
}

/** The acting user, resolved by either auth path (cookie session or mobile
 *  Bearer token). Decoupled from `requireUser()` so the same status-change
 *  logic serves both the web Server Action and the native API. */
export interface StatusActor {
  id: string;
  name: string;
  isAdmin: boolean;
}

export type SetStatusResult =
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    };

/**
 * Shared core for changing a task's status. Validates the transition against
 * the permission matrix, applies it atomically with an audit event under an
 * optimistic lock, and fans out notifications to the other participants.
 *
 * Caller-specific concerns (auth, rate-limiting, cache revalidation) live in
 * the wrappers — the web Server Action `setTaskStatus` and the mobile route
 * `POST /api/mobile/tasks/[id]/status` — so this stays transport-agnostic and
 * the rules never diverge between the two clients.
 */
export async function applyTaskStatusChange(
  actor: StatusActor,
  taskId: string,
  status: TaskStatus,
  expectedUpdatedAt: string,
  note?: string,
): Promise<SetStatusResult> {
  if (!UUID_RE.test(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };
  if (!TASK_STATUSES.includes(status))
    return { ok: false, error: "invalid", message: "Unknown status" };

  // Retry the read on a fresh connection — the first query of an action is the
  // one most likely to grab a stale/dead pooled connection (the recurring
  // "That didn't go through" signature). Reads are idempotent, so this is safe.
  const current = await withRetry(
    () => db.query.tasks.findFirst({ where: eq(tasks.id, taskId) }),
    { attempts: 2, timeoutMs: [4000, 6000], label: "set-status:read" },
  );
  if (!current) return { ok: false, error: "not-found" };

  const role: ActorRole = actor.isAdmin
    ? "admin"
    : current.doerId === actor.id
      ? "doer"
      : current.initiatorId === actor.id
        ? "initiator"
        : current.createdById === actor.id
          ? "creator"
          : "stranger";

  if (!canTransitionTo(current.status, status, role)) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  // Atomic: the task UPDATE and audit-event INSERT must either both commit or
  // both roll back. Notifications stay OUTSIDE the txn so a slow send doesn't
  // hold the row lock.
  const now = new Date();
  const stale = await db.transaction(async (tx) => {
    const u = await tx
      .update(tasks)
      .set({
        status,
        updatedAt: now,
        // Stamp completedAt on entry to "done"; clear it when leaving done.
        completedAt:
          status === "done" ? now : current.status === "done" ? null : current.completedAt,
      })
      .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
      .returning({ id: tasks.id });
    if (u.length === 0) return true;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: actor.id,
      eventType: "status_changed",
      fromValue: { status: current.status },
      toValue: { status },
      note: note?.trim() || null,
    });
    // Phase B (Law 2): append the domain event IN THE SAME TRANSACTION as the
    // row + audit, so the operational change and the event commit atomically.
    await emit(
      tx,
      taskStatusChanged(
        taskId,
        { doerId: current.doerId, fromStatus: current.status, toStatus: status },
        { actorId: actor.id },
      ),
    );
    return false;
  });
  if (stale) return { ok: false, error: "stale" };

  // The status change is now COMMITTED. Everything below is best-effort
  // side-effects (notifications + goal mirror) — DEFERRED to after the response
  // (Operation Butter: "persist, then return"). The clicker no longer waits on
  // up to 3 recipients × 4 external channels (email/WhatsApp/Slack/push) before
  // the tick registers. Notifications carry their own retry table + cron, so a
  // dropped after() is recoverable. try/catch keeps a blip from surfacing.
  nudgeRelay(); // low-latency projection update; cron is the durable backstop
  afterResponse(async () => {
    try {
      const trimmedNote = note?.trim() || undefined;
      const statusDisplay = await getStatusDisplayMap();
      const newStatusLabel = statusDisplay[status]?.label ?? status;
      const label = taskLabel({ subject: current.subject, title: current.title });
      await notifyManyForTask(taskId, {
        actorId: actor.id,
        kind: "status_changed",
        title: `${actor.name} changed status on '${label}' to ${newStatusLabel}`,
        body: JSON.stringify({
          toStatus: status,
          fromStatus: current.status,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        }),
        recipients: [current.createdById, current.initiatorId, current.doerId],
      });
      // Phase 2 — if this task was spun off a Weekly Goal, mirror the new status
      // back onto that goal (% done + status).
      if (current.originGoalId) await syncTaskToGoal(taskId, status);
    } catch (err) {
      console.warn("[set-status] post-commit side-effects failed (status already saved):", err);
    }
  });

  return { ok: true, updatedAt: now.toISOString() };
}
