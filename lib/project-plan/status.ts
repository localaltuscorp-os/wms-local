/**
 * Project Plan — the status model and who is allowed to set what.
 *
 * Client-SAFE on purpose (no `server-only`, no db import), for the same reason
 * `levels.ts` is: the picker in the browser and the server action that accepts
 * the write must agree about which statuses exist and who may choose them. One
 * copy of the rule, imported by both, so the UI cannot offer something the
 * server will reject and — far more importantly — the server never trusts the
 * UI to have hidden it.
 *
 * TWO FLOWS, per the brief:
 *
 *   WORKING     not_read · not_started · initiated · follow_up · need_info · done
 *               Set by the doer, their supervisor, or the project owner. This is
 *               a progress report: the person doing the work says where it is.
 *
 *   RESTRICTED  not_approved · approved · on_hold · cancelled · archived
 *               Set ONLY by the project owner or an admin. This is a RULING
 *               about the work, not a report on it — approving a project or
 *               putting it on hold is an authority decision, so a doer marking
 *               their own work "approved" has to be impossible in the API, not
 *               merely absent from the dropdown.
 *
 * The working values are deliberately the SAME six as `DOER_TASK_STATUSES` in
 * db/enums.ts (`dont_know` is displayed as "Not Read"), because an executable
 * plan row IS a WMS task: its status lives on the task and is written through
 * the same `setTaskStatus` action the WMS list and the kanban call. A container
 * row (project / milestone / result) has no task, so it carries its own
 * `project_nodes.status` — and it uses this same vocabulary so a project and
 * the actions under it are never described in two different languages.
 */

import { DOER_TASK_STATUSES, type TaskStatus } from "@/db/enums";

/** The working flow — the six a doer reports against. */
export const PLAN_WORKING_STATUSES = DOER_TASK_STATUSES;
export type PlanWorkingStatus = (typeof PLAN_WORKING_STATUSES)[number];

/**
 * The restricted flow. `archived` is included as a status VALUE here because
 * the brief lists it beside the approval verdicts, but it is stored as the
 * existing `project_nodes.is_archived` boolean rather than as a seventh string
 * — archiving already has a column, a filter and an index, and a parallel
 * status string that could disagree with it would be a bug waiting to happen.
 */
export const PLAN_RESTRICTED_STATUSES = [
  "not_approved",
  "approved",
  "on_hold",
  "cancelled",
  "archived",
] as const;
export type PlanRestrictedStatus = (typeof PLAN_RESTRICTED_STATUSES)[number];

export type PlanStatus = PlanWorkingStatus | PlanRestrictedStatus;

const WORKING_SET: ReadonlySet<string> = new Set(PLAN_WORKING_STATUSES);
const RESTRICTED_SET: ReadonlySet<string> = new Set(PLAN_RESTRICTED_STATUSES);

export function isWorkingStatus(v: string): v is PlanWorkingStatus {
  return WORKING_SET.has(v);
}

export function isRestrictedStatus(v: string): v is PlanRestrictedStatus {
  return RESTRICTED_SET.has(v);
}

export function isPlanStatus(v: string | null | undefined): v is PlanStatus {
  return !!v && (WORKING_SET.has(v) || RESTRICTED_SET.has(v));
}

/** Display labels. The working six borrow the WMS wording so the two screens
 *  name the same state identically — "Not Read", not "Don't know". */
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  dont_know: "Not Read",
  not_started: "Not Started",
  initiated: "Initiated",
  follow_up: "Follow Up",
  need_info: "Need Info",
  done: "Done",
  not_approved: "Not Approved",
  approved: "Approved",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  archived: "Archived",
};

/** Chip colours, reusing the palette the plan board already draws with. */
export const PLAN_STATUS_TONE: Record<PlanStatus, string> = {
  dont_know: "#94A3B8",
  not_started: "#64748B",
  initiated: "#0891B2",
  follow_up: "#F59E0B",
  need_info: "#7C3AED",
  done: "#16A34A",
  not_approved: "#DC2626",
  approved: "#15803D",
  on_hold: "#B45309",
  cancelled: "#78716C",
  archived: "#57534E",
};

/** The status a row is treated as having before anyone has touched it. */
export const DEFAULT_PLAN_STATUS: PlanStatus = "not_started";

/**
 * Who the caller is RELATIVE TO one node. Assembled on the server (the caller's
 * id, the node's owner, the caller's downline) and passed here, so this module
 * stays free of db imports and can be unit-tested with plain objects.
 */
export interface PlanActor {
  /** Signed-in employee id. */
  id: string;
  /** `employees.is_admin` — the designated authorised administrator. */
  isAdmin: boolean;
  /** True when this node's `owner_id` is the caller. */
  isOwner: boolean;
  /** True when the caller is the doer of the node's linked task. */
  isDoer: boolean;
  /** True when the node's owner or doer reports to the caller, directly or not. */
  isSupervisor: boolean;
}

/**
 * MAY this actor move this node to this status?
 *
 * The single authority for the rule, called by the server action BEFORE the
 * write and by the picker to decide what to render. Returns a reason rather
 * than a bare false so the API can say why instead of a flat "Forbidden".
 */
export function canSetPlanStatus(
  actor: PlanActor,
  next: string,
): { ok: true } | { ok: false; reason: string } {
  if (!isPlanStatus(next)) {
    return { ok: false, reason: `"${next}" is not a project status.` };
  }

  if (isRestrictedStatus(next)) {
    // The authority decisions. Admin or the project owner, nobody else — not
    // the doer who did the work, and not their supervisor.
    if (actor.isAdmin || actor.isOwner) return { ok: true };
    return {
      ok: false,
      reason: `Only the project owner or an administrator can set "${PLAN_STATUS_LABEL[next]}".`,
    };
  }

  // The working flow — a progress report, so the people close to the work.
  if (actor.isAdmin || actor.isOwner || actor.isDoer || actor.isSupervisor) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Only the doer, their supervisor or the project owner can update progress.",
  };
}

/** The statuses this actor may actually pick, for building a dropdown. Never
 *  the authority on a write — `canSetPlanStatus` is, and the server re-checks
 *  every value regardless of what the client managed to render. */
export function selectableStatuses(actor: PlanActor): PlanStatus[] {
  return [...PLAN_WORKING_STATUSES, ...PLAN_RESTRICTED_STATUSES].filter(
    (s) => canSetPlanStatus(actor, s).ok,
  );
}

/**
 * A restricted verdict outranks a working status for display: a cancelled
 * project is cancelled whatever its last progress report said. Returns the one
 * status a row should be shown as.
 */
export function effectivePlanStatus(
  status: string | null,
  approval: string | null,
  isArchived: boolean,
): PlanStatus {
  if (isArchived) return "archived";
  if (approval && isRestrictedStatus(approval)) return approval;
  if (status && isPlanStatus(status)) return status;
  return DEFAULT_PLAN_STATUS;
}

/** The WMS task status that corresponds to a working plan status — they are
 *  the same six values, so this is an identity guarded by a type check. */
export function toTaskStatus(s: PlanWorkingStatus): TaskStatus {
  return s;
}
