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
    with reset as (
      -- Restart draws a line under everything before it. The rows survive for
      -- the audit trail (and the Start/Stop history still lists them, greyed);
      -- what changes is that the TOTAL counts from the line forward, which is
      -- the whole point of a button that says the timer goes back to 00:00.
      select max(at) as at from task_time_events
      where task_id = ${taskId} and kind = 'timer_reset'
    ),
    s as (
      select revision, started_at, ended_at, duration_seconds, end_reason
      from task_work_sessions
      where task_id = ${taskId}
        and started_at >= coalesce((select at from reset), '-infinity'::timestamptz)
    ),
    ev as (
      -- NOT cut off at the reset: rejections decide the revision number, and a
      -- rework round is not undone by someone rewinding their stopwatch.
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

// ── Stop ─────────────────────────────────────────────────────────────────────

/**
 * End the run. The banked total is kept, exactly as Pause keeps it — what
 * differs is what the screen says afterwards.
 *
 * WHY A SEPARATE VERB AT ALL, when both close the open session. Pause reads as
 * "I am coming back in a minute" and offers one way forward; Stop reads as "this
 * sitting is over" and is where the screen then offers BOTH Resume and Restart.
 * The account holder asked for the two to behave differently, and a difference
 * that lived only in the button's colour would be a difference that vanished on
 * the next refresh — so it is written to the log, and the phase is derived from
 * the log.
 *
 * Idempotent on a timer that is already stopped, and legal on a PAUSED timer:
 * there is nothing to close in that case, and the event alone moves the phase.
 */
export async function stopWork(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };

  const now = new Date();
  await db.transaction(async (tx) => {
    const open = await liveSession(tx, taskId);
    // Already stopped and nothing running: say yes and write nothing. A second
    // Stop is a double-click or a stale tab, and an append-only log that
    // collects one row per impatient click is a log nobody reads.
    if (!open) {
      const [last] = (await tx.execute(
        sql`select kind from task_time_events where task_id = ${taskId}
            order by at desc limit 1`,
      )) as unknown as Array<{ kind: string }>;
      if (last?.kind === "work_stopped") return;
    }
    const revision = open ? open.revision : await currentRevisionOf(tx, taskId);
    if (open) await closeSession(tx, open, now, "stopped");
    await appendEvent(tx, {
      taskId,
      actorId: actor.id,
      doerId: loaded.ctx.doerId,
      kind: "work_stopped",
      revision,
      at: now,
      sessionId: open?.id ?? null,
    });
    await recomputeRollup(tx, taskId);
  });
  return { ok: true };
}

// ── Restart timer ────────────────────────────────────────────────────────────

/**
 * RESTART — the whole task timer goes back to 00:00:00 and starts counting again.
 *
 * This is the tenth report on these three buttons, and the standing complaint
 * was this one: Restart did not restart. It used to rewind only the session in
 * progress and KEEP every banked minute, so a task with 40 minutes on it read
 * 40:00 the instant after you pressed a button promising zero. That is now what
 * it says: zero, ticking.
 *
 * NOTHING IS DELETED. The sessions before the reset keep their rows, their
 * durations and their place in the Start/Stop history — they are closed with
 * `end_reason: 'reset'` and the rollup simply counts from the `timer_reset`
 * event forward (see recomputeRollup). An immutable ledger stays immutable; a
 * projection is allowed to have an opinion about which rows are current.
 *
 * It always ends RUNNING. "Start all over" is the request, and leaving the
 * screen at 00:00:00 stopped would need a second click to mean anything.
 */
export async function restartTimer(actor: TimeActor, taskId: string): Promise<TimeResult> {
  const loaded = await loadCtx(taskId, actor);
  if (!loaded.ok) return loaded;
  if (!loaded.canOperate) return { ok: false, error: "forbidden" };
  if (loaded.ctx.approvalStatus === "approved")
    return { ok: false, error: "locked", message: "This task is already approved." };

  const now = new Date();
  const doerId = loaded.ctx.doerId;

  await db.transaction(async (tx) => {
    const open = await liveSession(tx, taskId);
    const revision = open ? open.revision : await currentRevisionOf(tx, taskId);

    // Close whatever was running as DISCARDED rather than rewinding it: the
    // minutes it holds really were worked, and the audit trail is the one place
    // that should still be able to say so.
    if (open) await closeSession(tx, open, now, "reset");

    /* The line the rollup counts from, stamped ONE MILLISECOND EARLY.
       It is the same instant as the new session for every human purpose, but
       the timeline orders events by `at` and the reset must land before the
       `work_started` it causes — with identical stamps the order is whatever
       the index returns, and "Started Work" above "Timer Restarted" reads like
       the restart undid the start. The `started_at >= reset` filter is
       unaffected: the new session is a millisecond the RIGHT side of it. */
    const resetAt = new Date(now.getTime() - 1);
    await appendEvent(tx, {
      taskId,
      actorId: actor.id,
      doerId,
      kind: "timer_reset",
      revision,
      at: resetAt,
      sessionId: open?.id ?? null,
      // The timeline renders "restarted by {name}" from the actor join; the name
      // is stamped here too so the row survives an employee rename.
      meta: { actorName: actor.name },
    });

    const sessionId = randomUUID();
    await tx.insert(taskWorkSessions).values({
      id: sessionId,
      taskId,
      doerId,
      revision,
      startedAt: now,
    });
    await appendEvent(tx, {
      taskId, actorId: actor.id, doerId, kind: "work_started", revision, at: now, sessionId,
    });

    // A restart is work resuming, so a done/rejected task reopens — the same
    // rule startWork applies, for the same reason.
    if (loaded.ctx.status === "done" || loaded.ctx.approvalStatus === "not_approved") {
      await tx.update(tasks).set({ status: "initiated", completedAt: null, updatedAt: now }).where(eq(tasks.id, taskId));
    } else if (loaded.ctx.status === "not_started" || loaded.ctx.status === "dont_know") {
      await tx.update(tasks).set({ status: "initiated", updatedAt: now }).where(eq(tasks.id, taskId));
    }

    await recomputeRollup(tx, taskId);
  });

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
