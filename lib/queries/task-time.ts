import "server-only";

/**
 * Read model for a single task's time intelligence — the shape the per-task UI
 * (live timer, Work Sessions, activity timeline, revision history) renders.
 * Reads the projections (`task_work_sessions`, `task_time_rollup`) + the event
 * log (`task_time_events`), joined to employee names.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tasks,
  employees,
  taskTimeEvents,
  taskWorkSessions,
  taskTimeRollup,
} from "@/db/schema";
import type { TimeEventKind, SessionEndReason, TimerPhase } from "@/lib/tasks/time/types";
import { derivePhase } from "@/lib/tasks/time/phase";

export interface SessionRow {
  id: string;
  revision: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: SessionEndReason | null;
  live: boolean;
  /** Thrown away by a Restart: still in the ledger, no longer in the total.
   *  The Start/Stop history greys these rather than hiding them — a stopwatch
   *  you can silently empty is not an audit trail. */
  discarded: boolean;
}

export interface TimelineEntry {
  id: string;
  kind: TimeEventKind | "created";
  at: string;
  actorName: string;
  revision: number;
  sessionId: string | null;
  comment: string | null;
  autoReason: string | null;
}

export interface RevisionSummary {
  revision: number;
  totalSeconds: number;
  sessionCount: number;
  doneAt: string | null;
  verdict: "approved" | "not_approved" | null;
  comment: string | null;
}

export interface TaskTimeState {
  taskId: string;
  doerId: string;
  live: { sessionId: string; startedAt: string; revision: number } | null;
  /**
   * WHERE THE TIMER IS, decided once on the server and read by every control.
   *
   * The hero band and the rail card used to each work this out from whatever
   * props they happened to hold — one from `live`, the other from
   * `rollup.sessionCount` — which is how the screen ended up showing Pause at
   * the top and Start Work down the side at the same instant. There is now one
   * answer and both read it.
   */
  phase: TimerPhase;
  /** When the timer was last reset to zero; sessions before it are discarded. */
  resetAt: string | null;
  /** The newest event's stamp. The client uses it to tell whether the server
   *  has caught up with a click it already painted optimistically. */
  lastEventAt: string | null;
  rollup: {
    totalActiveSeconds: number;
    originalSeconds: number;
    revisionSeconds: number;
    sessionCount: number;
    pauseCount: number;
    rejectionCount: number;
    currentRevision: number;
    longestSessionSec: number;
    shortestSessionSec: number | null;
    avgSessionSec: number;
  };
  sessions: SessionRow[];
  timeline: TimelineEntry[];
  revisions: RevisionSummary[];
}

/**
 * Coerce a DB timestamp to an ISO string. Drizzle's `timestamp` columns SHOULD
 * yield `Date`, but the time-intel tables (created via raw idempotent-SQL migs)
 * can read back as ISO strings depending on the column/driver — so never assume
 * `.toISOString()` exists. Handles Date, string, and null uniformly.
 */
function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
function toIsoOrNull(v: Date | string | null | undefined): string | null {
  return v == null ? null : toIso(v);
}

export async function getTaskTimeState(taskId: string): Promise<TaskTimeState | null> {
  const [task] = await db
    .select({
      id: tasks.id,
      doerId: tasks.doerId,
      createdAt: tasks.createdAt,
      createdById: tasks.createdById,
      approvalStatus: tasks.approvalStatus,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return null;

  const [rollupRow] = await db
    .select()
    .from(taskTimeRollup)
    .where(eq(taskTimeRollup.taskId, taskId))
    .limit(1);

  const sessionRows = await db
    .select()
    .from(taskWorkSessions)
    .where(eq(taskWorkSessions.taskId, taskId))
    .orderBy(asc(taskWorkSessions.startedAt));

  const eventRows = await db
    .select({
      id: taskTimeEvents.id,
      kind: taskTimeEvents.kind,
      at: taskTimeEvents.at,
      actorName: employees.name,
      revision: taskTimeEvents.revision,
      sessionId: taskTimeEvents.sessionId,
      meta: taskTimeEvents.meta,
    })
    .from(taskTimeEvents)
    .leftJoin(employees, eq(employees.id, taskTimeEvents.actorId))
    .where(eq(taskTimeEvents.taskId, taskId))
    .orderBy(asc(taskTimeEvents.at));

  const [creator] = task.createdById
    ? await db.select({ name: employees.name }).from(employees).where(eq(employees.id, task.createdById)).limit(1)
    : [];

  /* The line a Restart drew. Sessions that started before it are history, not
     total — the same cutoff the rollup applies in SQL, so the card's big number
     and the rows underneath it can never tell different stories. */
  const resetEvents = eventRows.filter((e) => e.kind === "timer_reset");
  const resetAt = resetEvents.length > 0 ? toIso(resetEvents[resetEvents.length - 1]!.at) : null;

  const sessions: SessionRow[] = sessionRows.map((s) => ({
    id: s.id,
    revision: s.revision,
    startedAt: toIso(s.startedAt),
    endedAt: toIsoOrNull(s.endedAt),
    durationSeconds: s.durationSeconds,
    endReason: (s.endReason as SessionEndReason | null) ?? null,
    live: s.endedAt === null,
    discarded: resetAt != null && toIso(s.startedAt) < resetAt,
  }));

  const live = sessions.find((s) => s.live) ?? null;

  const timeline: TimelineEntry[] = [
    {
      id: `created:${taskId}`,
      kind: "created" as const,
      at: toIso(task.createdAt),
      actorName: creator?.name ?? "—",
      revision: 1,
      sessionId: null,
      comment: null,
      autoReason: null,
    },
    ...eventRows.map((e) => {
      const meta = (e.meta ?? {}) as { comment?: string; autoReason?: string };
      return {
        id: e.id,
        kind: e.kind as TimeEventKind,
        at: toIso(e.at),
        actorName: e.actorName ?? "—",
        revision: e.revision,
        sessionId: e.sessionId,
        comment: meta.comment ?? null,
        autoReason: meta.autoReason ?? null,
      };
    }),
  ];

  // Revision summaries: fold sessions + verdict events per revision cycle.
  const revMap = new Map<number, RevisionSummary>();
  for (const s of sessions) {
    const r = revMap.get(s.revision) ?? { revision: s.revision, totalSeconds: 0, sessionCount: 0, doneAt: null, verdict: null, comment: null };
    if (s.durationSeconds != null) {
      r.totalSeconds += s.durationSeconds;
      r.sessionCount += 1;
    }
    revMap.set(s.revision, r);
  }
  for (const e of eventRows) {
    const meta = (e.meta ?? {}) as { comment?: string };
    if (e.kind === "work_done") {
      const r = revMap.get(e.revision) ?? { revision: e.revision, totalSeconds: 0, sessionCount: 0, doneAt: null, verdict: null, comment: null };
      r.doneAt = toIso(e.at);
      revMap.set(e.revision, r);
    } else if (e.kind === "approved" || e.kind === "sent_back") {
      const r = revMap.get(e.revision) ?? { revision: e.revision, totalSeconds: 0, sessionCount: 0, doneAt: null, verdict: null, comment: null };
      r.verdict = e.kind === "approved" ? "approved" : "not_approved";
      r.comment = meta.comment ?? null;
      revMap.set(e.revision, r);
    }
  }
  const revisions = [...revMap.values()].sort((a, b) => a.revision - b.revision);

  const sessionCount = rollupRow?.sessionCount ?? 0;
  const total = rollupRow?.totalActiveSeconds ?? 0;

  /* ── THE PHASE ─────────────────────────────────────────────────────────
     One word, derived from the log (lib/tasks/time/phase.ts), read by every
     control on the screen so none of them has to guess. */
  const sinceReset = sessions.filter((s) => !s.discarded);
  const phase: TimerPhase = derivePhase({
    hasLiveSession: live != null,
    lastEventKind: eventRows.length > 0 ? (eventRows[eventRows.length - 1]!.kind as TimeEventKind) : null,
    sessionsSinceReset: sinceReset.length,
  });

  return {
    taskId,
    doerId: task.doerId,
    live: live ? { sessionId: live.id, startedAt: live.startedAt, revision: live.revision } : null,
    phase,
    resetAt,
    lastEventAt: eventRows.length > 0 ? toIso(eventRows[eventRows.length - 1]!.at) : null,
    rollup: {
      totalActiveSeconds: total,
      originalSeconds: rollupRow?.originalSeconds ?? 0,
      revisionSeconds: rollupRow?.revisionSeconds ?? 0,
      sessionCount,
      pauseCount: rollupRow?.pauseCount ?? 0,
      rejectionCount: rollupRow?.rejectionCount ?? 0,
      currentRevision: rollupRow?.currentRevision ?? 1,
      longestSessionSec: rollupRow?.longestSessionSec ?? 0,
      shortestSessionSec: rollupRow?.shortestSessionSec ?? null,
      avgSessionSec: sessionCount > 0 ? Math.round(total / sessionCount) : 0,
    },
    sessions,
    timeline,
    revisions,
  };
}

/** Is there a live session on this task right now (cheap check for list rows). */
export async function taskHasLiveSession(taskId: string): Promise<boolean> {
  const rows = await db
    .select({ id: taskWorkSessions.id })
    .from(taskWorkSessions)
    .where(and(eq(taskWorkSessions.taskId, taskId), isNull(taskWorkSessions.endedAt)))
    .limit(1);
  return rows.length > 0;
}
