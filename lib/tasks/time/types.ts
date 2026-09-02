/**
 * Task Time Intelligence — shared types. Client-safe (no server imports) so the
 * timer UI and the server engine share one vocabulary.
 */

/** Kinds written to the `task_time_events` append-only log. */
export type TimeEventKind =
  // `task_time_events.kind` is plain `text` with no CHECK constraint or enum
  // (see migration 0175), so adding a kind here needs NO migration — this union
  // is the only thing that constrains it.
  | "timer_restarted"
  | "work_started"
  | "work_paused"
  | "work_resumed"
  | "work_done"
  | "sent_back"
  | "approved"
  | "revision_started"
  | "auto_closed";

/** Why a session ended (on `task_work_sessions.end_reason`). */
export type SessionEndReason = "paused" | "done" | "auto_idle" | "auto_daily";

export type TimeActor = { id: string; name: string; isAdmin: boolean };

export type TimeResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "locked" | "conflict"; message?: string };

/** A live session as the client needs it to render + drive the ticking timer. */
export interface LiveSession {
  sessionId: string;
  taskId: string;
  startedAt: string; // ISO — client computes elapsed from here
  revision: number;
}

/** Verdict a manager can issue on a submitted (done) task. */
export type ApprovalVerdict = "approved" | "not_approved";

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Compact "Nm" / "Nh Mm" label used in Work Sessions rows + reports. */
export function formatMinutesLabel(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
