/**
 * Pure-function status-transition matrix.
 *
 * The single source of truth for "from status X, may an actor in
 * relationship R move to status Y?"  Server Actions consult it
 * defensively; the UI consults it to hide disallowed controls.
 * Spec lines 218-230 ("Permissions matrix").
 *
 * No DB, no I/O.  Adding a new transition = update this file + add
 * a test row in tests/unit/status-transitions.test.ts.
 */

import {
  PENDING_STATUSES,
  TASK_STATUSES,
  type TaskStatus,
} from "@/db/enums";

export type ActorRole = "doer" | "initiator" | "creator" | "admin" | "stranger";

const PENDING = new Set<TaskStatus>(PENDING_STATUSES);
const NON_TERMINAL: TaskStatus[] = [...PENDING_STATUSES, "done"];

/**
 * Returns the list of statuses the given actor can move the task into
 * from `current`.  Returns an empty array if no transitions are allowed.
 */
export function nextStatusesFor(
  current: TaskStatus,
  role: ActorRole,
): TaskStatus[] {
  // Admin override: can do anything except self-transition.
  if (role === "admin") {
    return TASK_STATUSES.filter((s) => s !== current);
  }
  // Stranger / creator-only: never anything.
  if (role === "stranger") return [];

  switch (current) {
    case "dont_know":         // Manan 2026-05 — pending lane
    case "not_started":
    case "initiated":
    case "follow_up":         // legacy
    case "need_help":
    case "on_hold":           // Manan 2026-05 — pending lane (neutral hold)
    case "need_info":         // Tier-3
    case "follow_up_1":       // Tier-3
    case "follow_up_2":       // Tier-3
    case "follow_up_3": {     // Tier-3
      // Pending lane: doer + initiator may move sideways within pending,
      // and may cancel/transfer (initiator only) or mark done (doer only).
      const out: TaskStatus[] = [];
      if (role === "doer" || role === "initiator") {
        for (const peer of PENDING) {
          if (peer !== current) out.push(peer);
        }
      }
      if (role === "doer") out.push("done");
      if (role === "initiator") {
        out.push("cancelled", "transferred");
      }
      return out;
    }

    case "done": {
      // Doer cannot self-approve.  Initiator approves/declines; can also
      // cancel/transfer (still "non-terminal" from spec POV).
      if (role === "initiator") {
        return ["approved", "not_approved", "cancelled", "transferred"];
      }
      return [];
    }

    case "not_approved": {
      // Rework path: doer can re-enter the pending lane.
      // Initiator can also cancel or transfer if work was abandoned.
      if (role === "doer") return [...PENDING];
      if (role === "initiator") return ["cancelled", "transferred"];
      return [];
    }

    // Terminal for non-admin.
    case "approved":
    case "cancelled":
    case "transferred":
      return [];
  }
}

/** Convenience predicate.  Returns false on self-transition. */
export function canTransitionTo(
  from: TaskStatus,
  to: TaskStatus,
  role: ActorRole,
): boolean {
  if (from === to) return false;
  return nextStatusesFor(from, role).includes(to);
}

/** Re-export for callers that only need this list. */
export { NON_TERMINAL };
