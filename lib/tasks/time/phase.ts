import type { TimeEventKind, TimerPhase } from "./types";

/**
 * WHERE THE TIMER IS, from the event log alone.
 *
 * Pulled out of the query so it can be tested without a database, because it is
 * the fact the whole screen branches on: the hero band, the Time Spent card and
 * the Time Log tab all render their buttons from this one word. They used to
 * work it out for themselves — one from `live`, one from `rollup.sessionCount`
 * — and disagreed, which is what "the three are not in sync" meant.
 *
 * IT IS DERIVED, NEVER STORED. A `stopped` flag on the task would be a second
 * source of truth to keep in step with the ledger, and the first thing to fall
 * out of step (a session auto-closed by the cron, a verdict issued while a
 * timer ran). The log already knows; this reads it.
 */
export function derivePhase(input: {
  /** Is a session open right now? */
  hasLiveSession: boolean;
  /** The newest event on the task, or null when nothing has happened yet. */
  lastEventKind: TimeEventKind | null;
  /** Sessions recorded since the last Restart — 0 means nothing to resume. */
  sessionsSinceReset: number;
}): TimerPhase {
  if (input.hasLiveSession) return "running";
  // STOPPED is what Stop, Mark-as-Done and a verdict leave behind. It differs
  // from paused only in what the screen offers next — Restart alongside Resume
  // — and that difference has to survive a refresh, which is why it is read
  // back from the log rather than held in a component.
  if (
    input.lastEventKind === "work_stopped" ||
    input.lastEventKind === "work_done" ||
    input.lastEventKind === "approved"
  )
    return "stopped";
  return input.sessionsSinceReset > 0 ? "paused" : "idle";
}
