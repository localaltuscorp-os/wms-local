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
  /** RESET TO ZERO, and the reason it is not `timer_restarted`.
   *
   *  `timer_restarted` used to mean "rewind the session in progress; keep every
   *  banked minute" — which is not what anyone pressing a button labelled
   *  Restart expects, and was the standing complaint: the clock did not go to
   *  00:00. Restart now clears the task's recorded time and counts again from
   *  zero, and it writes THIS kind.
   *
   *  A second kind rather than new semantics on the old one, because the rollup
   *  reads the log: re-pointing `timer_restarted` at the new rule would silently
   *  wipe the banked time of every task someone restarted under the old one, the
   *  next time that task was touched. Old events keep their old meaning forever. */
  | "timer_reset"
  | "work_started"
  | "work_paused"
  | "work_resumed"
  /** STOP — the run is over, as opposed to paused mid-run. Both close the open
   *  session; what differs is what the screen offers next (Resume + Restart,
   *  rather than a Resume that looks like the only way forward). */
  | "work_stopped"
  | "work_done"
  | "sent_back"
  | "approved"
  | "revision_started"
  | "auto_closed";

/** Why a session ended (on `task_work_sessions.end_reason`).
 *  `reset` marks a session the user threw away with Restart: the row stays in
 *  the ledger for the audit trail, but the rollup stops counting it. */
export type SessionEndReason =
  | "paused"
  | "stopped"
  | "reset"
  | "done"
  | "auto_idle"
  | "auto_daily";

/**
 * WHERE THE TIMER IS, as one word — the single fact every control on the screen
 * branches on, so the hero band and the rail card cannot offer different
 * buttons for the same state (they used to, and that is what "not in sync"
 * meant: one said Pause while the other said Start Work).
 *
 *   idle     nothing recorded since the last reset  → Start
 *   running  a session is open, the clock ticks     → Pause · Stop · Restart
 *   paused   mid-run, banked, resumable             → Resume · Stop · Restart
 *   stopped  the run is over (or the work is done)  → Restart · Resume
 */
export type TimerPhase = "idle" | "running" | "paused" | "stopped";

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
