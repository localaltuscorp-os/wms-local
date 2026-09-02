/**
 * Task Time Intelligence — transport-agnostic engine (shared by the web Server
 * Actions and, later, the mobile API). Every mutation:
 *   1. resolves + authorises the actor (doer, doer's manager, or admin),
 *   2. appends an IMMUTABLE row to `task_time_events` (source of truth),
 *   3. opens/closes the `task_work_sessions` ledger row, and
 *   4. recomputes the `task_time_rollup` projection —
 * all inside ONE transaction. Notifications + goal mirroring run after the
 * response, mirroring lib/tasks/set-status.ts.
 *
 * Invariants (see docs/superpowers/specs/2026-08-03-task-time-intelligence-design.md):
 *  · the event log + session ledger are never overwritten (a session's
 *    duration is written exactly once, when it closes);
 *  · every rejection opens a NEW revision cycle instead of replacing the old one;
 *  · total effort = Σ duration_seconds across every session of every revision;
 *  · durations are always computed — never entered by hand.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tasks,
  employees,
  taskTimeEvents,
  taskWorkSessions,
  taskTimeRollup,
} from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { afterResponse } from "@/lib/after";
import { notifyManyForTask } from "@/lib/notifications/dispatch";
import { syncTaskToGoal } from "@/lib/weekly-goals/task-sync";
import { taskLabel } from "@/lib/tasks/set-status";
import type { TimeActor, TimeResult, TimeEventKind, SessionEndReason, ApprovalVerdict } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface TaskCtx {
  id: string;
  doerId: string;
  managerId: string | null;
  status: string;
  approvalStatus: string | null;
  originGoalId: string | null;
  subject: string | null;
  title: string;
  createdById: string | null;
  initiatorId: string;
}

/** Load the task + the doer's manager, and decide whether `actor` may operate. */
async function loadCtx(taskId: string, actor: TimeActor): Promise<
  | { ok: true; ctx: TaskCtx; canOperate: boolean; canApprove: boolean }
  | { ok: false; error: "invalid" | "not-found" }
> {
  if (!UUID_RE.test(taskId)) return { ok: false, error: "invalid" };
  const row = await withRetry(
    () =>
      db
        .select({
          id: tasks.id,
          doerId: tasks.doerId,
          managerId: employees.managerId,
          status: tasks.status,
          approvalStatus: tasks.approvalStatus,
          originGoalId: tasks.originGoalId,
          subject: tasks.subject,
          title: tasks.title,
          createdById: tasks.createdById,
          initiatorId: tasks.initiatorId,
        })
        .from(tasks)
        .leftJoin(employees, eq(employees.id, tasks.doerId))
        .where(eq(tasks.id, taskId))
        .limit(1),
    { attempts: 2, timeoutMs: [4000, 6000], label: "time:loadCtx" },
  );
  const ctx = row[0] as TaskCtx | undefined;
  if (!ctx) return { ok: false, error: "not-found" };
  const isDoer = actor.id === ctx.doerId;
  const isManager = !!ctx.managerId && actor.id === ctx.managerId;
  return {
    ok: true,
    ctx,
    canOperate: actor.isAdmin || isDoer || isManager,
    canApprove: actor.isAdmin || isManager,
  };
}

/** Append one immutable event to the log. */
async function appendEvent(
  tx: Tx,
  args: {
    taskId: string;
    actorId: string;
    doerId: string;
    kind: TimeEventKind;
    revision: number;
    at: Date;
    sessionId?: string | null;
    meta?: Record<string, unknown> | null;
  },
) {
  await tx.insert(taskTimeEvents).values({
    taskId: args.taskId,
    actorId: args.actorId,
    doerId: args.doerId,
    kind: args.kind,
    revision: args.revision,
    at: args.at,
    sessionId: args.sessionId ?? null,
    meta: args.meta ?? null,
  });
}

/** Recompute the per-task rollup projection from the ledger + event log. Runs in
 *  the same transaction as the event that triggered it, so reads stay fast and
 *  the projection can always be rebuilt from source. */
async function recomputeRollup(tx: Tx, taskId: string) {
  const [agg] = (await tx.execute(sql`
    with s as (
      select revision, started_at, ended_at, duration_seconds, end_reason
      from task_work_sessions where task_id = ${taskId}
    ),
    ev as (
      select kind, at from task_time_events where task_id = ${taskId}
    )
    select
      coalesce(sum(duration_seconds), 0)::int                                              as total_active_seconds,
      coalesce(sum(duration_seconds) filter (where revision = 1), 0)::int                  as original_seconds,
      coalesce(sum(duration_seconds) filter (where revision >= 2), 0)::int                 as revision_seconds,
      count(*) filter (where ended_at is not null)::int                                    as session_count,
      count(*) filter (where end_reason = 'paused')::int                                   as pause_count,
      coalesce(max(duration_seconds), 0)::int                                              as longest_session_sec,
      min(duration_seconds) filter (where ended_at is not null)::int                       as shortest_session_sec,
      min(started_at)                                                                      as first_started_at,
      count(*) filter (where ended_at is null)::int                                        as open_session_count,
      (select count(*) from ev where kind = 'sent_back')::int                              as rejection_count,
      (select max(at) from ev where kind = 'work_done')                                    as last_done_at,
      (select max(at) from ev where kind = 'approved')                                     as approved_at
    from s
  `)) as unknown as Array<{
    total_active_seconds: number;
    original_seconds: number;
    revision_seconds: number;
    session_count: number;
    pause_count: number;
    longest_session_sec: number;
    shortest_session_sec: number | null;
    first_started_at: Date | null;
    open_session_count: number;
    rejection_count: number;
    last_done_at: Date | null;
    approved_at: Date | null;
  }>;

  const r = agg ?? {
    total_active_seconds: 0,
    original_seconds: 0,
    revision_seconds: 0,
    session_count: 0,
    pause_count: 0,
    longest_session_sec: 0,
    shortest_session_sec: null,
    first_started_at: null,
    open_session_count: 0,
    rejection_count: 0,
    last_done_at: null,
    approved_at: null,
  };
  const currentRevision = r.rejection_count + 1;

  // Raw `tx.execute(sql)` returns timestamp columns as ISO STRINGS (not Date),
  // and Drizzle's `timestamp` mapper calls `.toISOString()` on the value it's
  // given — so inserting the raw string crashes with "toISOString is not a
  // function" and rolls back the whole session write. Coerce back to Date first.
  const toDate = (v: Date | string | null): Date | null =>
    v == null ? null : v instanceof Date ? v : new Date(v);
  const firstStartedAt = toDate(r.first_started_at);
  const lastDoneAt = toDate(r.last_done_at);
  const approvedAt = toDate(r.approved_at);

  await tx
    .insert(taskTimeRollup)
    .values({
      taskId,
      totalActiveSeconds: r.total_active_seconds,
      originalSeconds: r.original_seconds,
      revisionSeconds: r.revision_seconds,
      sessionCount: r.session_count,
      pauseCount: r.pause_count,
      rejectionCount: r.rejection_count,
      currentRevision,
      longestSessionSec: r.longest_session_sec,
      shortestSessionSec: r.shortest_session_sec,
      firstStartedAt,
      lastDoneAt,
      approvedAt,
      openSessionCount: r.open_session_count,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: taskTimeRollup.taskId,
      set: {
        totalActiveSeconds: r.total_active_seconds,
        originalSeconds: r.original_seconds,
        revisionSeconds: r.revision_seconds,
        sessionCount: r.session_count,
        pauseCount: r.pause_count,
        rejectionCount: r.rejection_count,
        currentRevision,
        longestSessionSec: r.longest_session_sec,
        shortestSessionSec: r.shortest_session_sec,
        firstStartedAt,
        lastDoneAt,
        approvedAt,
        openSessionCount: r.open_session_count,
        updatedAt: new Date(),
      },
    });
  return currentRevision;
}

/** The doer's current revision number for a task (rejections + 1). */
async function currentRevisionOf(tx: Tx, taskId: string): Promise<number> {
  const [row] = (await tx.execute(
    sql`select (count(*) filter (where kind = 'sent_back') + 1)::int as rev
        from task_time_events where task_id = ${taskId}`,
  )) as unknown as Array<{ rev: number }>;
  return row?.rev ?? 1;
}

/** Find the currently-open (live) session for this task's doer, if any. */
async function liveSession(tx: Tx, taskId: string) {
  const rows = await tx
    .select()
    .from(taskWorkSessions)
    .where(and(eq(taskWorkSessions.taskId, taskId), isNull(taskWorkSessions.endedAt)))
    .limit(1);
  return rows[0] ?? null;
}

// ── Start / Resume ──────────────────────────────────────────────────────────

/** Begin (or resume) recording work on a task. Idempotent if already running. */
export async function startWork(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };
  if (loaded.ctx.approvalStatus === "approved")
    return { ok: false, error: "locked", message: "This task is approved and locked." };

  const doerId = loaded.ctx.doerId;
  const now = new Date();
  await db.transaction(async (tx) => {
    const open = await liveSession(tx, taskId);
    if (open) return; // already running — no-op

    const revision = await currentRevisionOf(tx, taskId);
    // Is this the first session of this revision? → work_started, else work_resumed.
    const countRows = (await tx.execute(
      sql`select count(*)::int as n from task_work_sessions
          where task_id = ${taskId} and revision = ${revision}`,
    )) as unknown as Array<{ n: number }>;
    const firstOfRevision = (countRows[0]?.n ?? 0) === 0;

    // A brand-new revision (>1) opens with a revision_started marker.
    if (firstOfRevision && revision > 1) {
      await appendEvent(tx, {
        taskId, actorId: actor.id, doerId, kind: "revision_started", revision, at: now,
      });
    }

    const sessionId = randomUUID();
    await tx.insert(taskWorkSessions).values({
      id: sessionId,
      taskId,
      doerId,
      revision,
      startedAt: now,
    });
    await appendEvent(tx, {
      taskId,
      actorId: actor.id,
      doerId,
      kind: firstOfRevision ? "work_started" : "work_resumed",
      revision,
      at: now,
      sessionId,
    });

    // Reopen the task into an active status when work resumes on a done/rejected task.
    if (loaded.ctx.status === "done" || loaded.ctx.approvalStatus === "not_approved") {
      await tx.update(tasks).set({ status: "initiated", completedAt: null, updatedAt: now }).where(eq(tasks.id, taskId));
    } else if (loaded.ctx.status === "not_started" || loaded.ctx.status === "dont_know") {
      await tx.update(tasks).set({ status: "initiated", updatedAt: now }).where(eq(tasks.id, taskId));
    }
    await recomputeRollup(tx, taskId);
  });
  return { ok: true };
}

// ── Pause ────────────────────────────────────────────────────────────────────

export async function pauseWork(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };

  const now = new Date();
  let closed = false;
  await db.transaction(async (tx) => {
    const open = await liveSession(tx, taskId);
    if (!open) return; // nothing running
    await closeSession(tx, open, now, "paused");
    await appendEvent(tx, {
      taskId, actorId: actor.id, doerId: open.doerId, kind: "work_paused",
      revision: open.revision, at: now, sessionId: open.id,
    });
    await recomputeRollup(tx, taskId);
    closed = true;
  });
  if (!closed) return { ok: false, error: "conflict", message: "No session is running." };
  return { ok: true };
}

// ── Restart timer ────────────────────────────────────────────────────────────

/**
 * Reset the CURRENT session's clock to 00:00:00.
 *
 * Deliberately narrow: it rewinds the session in progress and nothing else. No
 * event row is ever deleted and no banked time is touched, because a session's
 * `duration_seconds` is only written when it CLOSES — so the time being
 * discarded here was never in the rollup to begin with, and every completed
 * session from earlier rounds is left exactly as it was. That is what keeps this
 * safe to expose next to Pause: the worst case is losing the minutes since the
 * last Start, never the audit trail.
 *
 * Running  → rewind the open session's started_at to now; it keeps running.
 * Paused   → nothing is running to rewind, so open a fresh session at zero,
 *            which is the only reading of "restart" that leaves a timer at
 *            00:00:00. Revision is inherited, so a rework round stays a rework
 *            round.
 */
export async function restartTimer(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };
  if (loaded.ctx.approvalStatus === "approved")
    return { ok: false, error: "locked", message: "This task is already approved." };

  const now = new Date();
  const doerId = loaded.ctx.doerId;
  let restarted = false;

  await db.transaction(async (tx) => {
    const open = await liveSession(tx, taskId);
    const revision = open ? open.revision : await currentRevisionOf(tx, taskId);
    let sessionId: string | null = open?.id ?? null;

    if (open) {
      // Guarded on `ended_at is null` so a session auto-closed by the cron
      // between our read and this write is never resurrected.
      await tx
        .update(taskWorkSessions)
        .set({ startedAt: now })
        .where(and(eq(taskWorkSessions.id, open.id), isNull(taskWorkSessions.endedAt)));
    } else {
      sessionId = randomUUID();
      await tx.insert(taskWorkSessions).values({
        id: sessionId,
        taskId,
        doerId,
        revision,
        startedAt: now,
      });
    }

    await appendEvent(tx, {
      taskId,
      actorId: actor.id,
      doerId,
      kind: "timer_restarted",
      revision,
      at: now,
      sessionId,
      // The timeline renders "restarted by {name}" from the actor join, but the
      // name is stamped here too so the row survives an employee rename.
      meta: { actorName: actor.name },
    });
    await recomputeRollup(tx, taskId);
    restarted = true;
  });

  if (!restarted) return { ok: false, error: "conflict", message: "Couldn't restart the timer." };
  return { ok: true };
}

// ── Mark Done ────────────────────────────────────────────────────────────────

export async function markDone(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };
  if (loaded.ctx.approvalStatus === "approved")
    return { ok: false, error: "locked", message: "This task is already approved." };

  const now = new Date();
  let revision = 1;
  await db.transaction(async (tx) => {
    revision = await currentRevisionOf(tx, taskId);
    const open = await liveSession(tx, taskId);
    if (open) {
      await closeSession(tx, open, now, "done");
      revision = open.revision;
    }
    await appendEvent(tx, {
      taskId, actorId: actor.id, doerId: loaded.ctx.doerId, kind: "work_done",
      revision, at: now, sessionId: open?.id ?? null,
    });
    await tx
      .update(tasks)
      .set({ status: "done", completedAt: now, updatedAt: now })
      .where(eq(tasks.id, taskId));
    await recomputeRollup(tx, taskId);
  });

  const ctx = loaded.ctx;
  afterResponse(async () => {
    try {
      const label = taskLabel({ subject: ctx.subject, title: ctx.title });
      await notifyManyForTask(taskId, {
        actorId: actor.id,
        kind: "status_changed",
        title: `${actor.name} marked '${label}' as Done`,
        body: JSON.stringify({ toStatus: "done", fromStatus: ctx.status }),
        recipients: [ctx.createdById, ctx.initiatorId, ctx.managerId].filter(Boolean) as string[],
      });
      if (ctx.originGoalId) await syncTaskToGoal(taskId, "done");
    } catch (err) {
      console.warn("[time:markDone] post-commit side-effects failed:", err);
    }
  });
  return { ok: true };
}

// ── Manager verdict: Approve / Not-Approved ──────────────────────────────────

export async function decideApproval(
  actor: TimeActor,
  taskId: string,
  verdict: ApprovalVerdict,
  comment?: string,
): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canApprove) return { ok: false, error: "forbidden" };
  const trimmed = comment?.trim() || null;
  if (verdict === "not_approved" && !trimmed)
    return { ok: false, error: "invalid", message: "A comment is required when sending back." };

  const now = new Date();
  await db.transaction(async (tx) => {
    // Close any straggler live session so its time is captured before the verdict.
    const open = await liveSession(tx, taskId);
    if (open) {
      await closeSession(tx, open, now, "done");
      await appendEvent(tx, {
        taskId, actorId: actor.id, doerId: open.doerId, kind: "work_paused",
        revision: open.revision, at: now, sessionId: open.id, meta: { autoReason: "verdict" },
      });
    }
    const revision = await currentRevisionOf(tx, taskId);
    if (verdict === "approved") {
      await appendEvent(tx, {
        taskId, actorId: actor.id, doerId: loaded.ctx.doerId, kind: "approved",
        revision, at: now, meta: trimmed ? { comment: trimmed } : null,
      });
      await tx
        .update(tasks)
        .set({ approvalStatus: "approved", approvedById: actor.id, approvedAt: now, approvalNote: trimmed, updatedAt: now })
        .where(eq(tasks.id, taskId));
    } else {
      await appendEvent(tx, {
        taskId, actorId: actor.id, doerId: loaded.ctx.doerId, kind: "sent_back",
        revision, at: now, meta: { comment: trimmed },
      });
      await tx
        .update(tasks)
        .set({ approvalStatus: "not_approved", approvalNote: trimmed, updatedAt: now })
        .where(eq(tasks.id, taskId));
    }
    await recomputeRollup(tx, taskId);
  });

  const ctx = loaded.ctx;
  afterResponse(async () => {
    try {
      const label = taskLabel({ subject: ctx.subject, title: ctx.title });
      await notifyManyForTask(taskId, {
        actorId: actor.id,
        kind: verdict === "approved" ? "approved" : "declined",
        title:
          verdict === "approved"
            ? `${actor.name} approved '${label}'`
            : `${actor.name} sent '${label}' back for revision`,
        body: JSON.stringify({ verdict, ...(trimmed ? { note: trimmed } : {}) }),
        recipients: [ctx.doerId, ctx.initiatorId].filter(Boolean) as string[],
      });
    } catch (err) {
      console.warn("[time:decideApproval] post-commit side-effects failed:", err);
    }
  });
  return { ok: true };
}

/** Close a live session row: freeze ended_at + duration_seconds (once only). */
async function closeSession(
  tx: Tx,
  session: { id: string; startedAt: Date },
  endedAt: Date,
  reason: SessionEndReason,
) {
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000));
  await tx
    .update(taskWorkSessions)
    .set({ endedAt, durationSeconds, endReason: reason })
    .where(and(eq(taskWorkSessions.id, session.id), isNull(taskWorkSessions.endedAt)));
}

// ── Auto-close (cron) ────────────────────────────────────────────────────────

/**
 * Close sessions left running too long. A live session is auto-closed when it has
 * been open longer than `idleCapMinutes` OR was started before today's cutoff and
 * is still open past it. The stored end time is capped so a forgotten overnight
 * timer never inflates the numbers; the timeline flags it as auto-closed.
 */
export async function autoCloseStaleSessions(idleCapMinutes: number, now: Date): Promise<number> {
  const cutoffMs = idleCapMinutes * 60 * 1000;
  const open = await db
    .select()
    .from(taskWorkSessions)
    .where(isNull(taskWorkSessions.endedAt));
  let closed = 0;
  for (const s of open) {
    const ageMs = now.getTime() - s.startedAt.getTime();
    if (ageMs < cutoffMs) continue;
    const endedAt = new Date(s.startedAt.getTime() + cutoffMs); // cap the credited time
    await db.transaction(async (tx) => {
      // Re-check still-open inside the txn (another action may have paused it).
      const stillOpen = await tx
        .select({ id: taskWorkSessions.id })
        .from(taskWorkSessions)
        .where(and(eq(taskWorkSessions.id, s.id), isNull(taskWorkSessions.endedAt)))
        .limit(1);
      if (stillOpen.length === 0) return;
      await closeSession(tx, s, endedAt, "auto_idle");
      await appendEvent(tx, {
        taskId: s.taskId, actorId: s.doerId, doerId: s.doerId, kind: "auto_closed",
        revision: s.revision, at: endedAt, sessionId: s.id, meta: { autoReason: "idle_cap", idleCapMinutes },
      });
      await recomputeRollup(tx, s.taskId);
    });
    closed += 1;
  }
  return closed;
}
