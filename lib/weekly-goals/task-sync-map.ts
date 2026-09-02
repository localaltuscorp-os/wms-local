import type { TaskStatus } from "@/db/enums";

/**
 * Pure mapping functions for the Goal⇄Task two-way sync (Phase 2). Kept in their
 * own module (no `server-only`) so they're unit-testable in isolation — the
 * server-side `task-sync.ts` imports + re-exports them. Mirrors the
 * gate / gate-cadence split.
 */

/** Map a goal's % done onto a task status, preserving an existing in-progress
 *  nuance (follow_up / need_info / …) instead of flattening it to "initiated". */
export function pctToTaskStatus(pct: number, currentStatus: TaskStatus): TaskStatus {
  if (pct >= 100) return "done";
  if (pct <= 0) return "not_started";
  const isActiveNuance =
    currentStatus !== "done" &&
    currentStatus !== "not_started" &&
    currentStatus !== "dont_know";
  return isActiveNuance ? currentStatus : "initiated";
}

/** Map a task status onto a goal's % done, preserving an existing partial. */
export function taskStatusToGoalPct(status: TaskStatus, currentPct: number): number {
  if (status === "done") return 100;
  if (status === "not_started" || status === "dont_know") return 0;
  return currentPct > 0 && currentPct < 100 ? currentPct : 50;
}
