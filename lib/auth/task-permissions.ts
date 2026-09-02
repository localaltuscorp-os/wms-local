/**
 * Pure boolean predicates for task-level permission checks.
 * Used by both the Server Actions (defensive) and the UI (to hide
 * disallowed controls).  No DB / no I/O.
 */

import { PENDING_STATUSES, type TaskStatus } from "@/db/enums";
import { type ActorRole } from "@/lib/auth/status-transitions";

export type TaskPermissionInput = {
  employee: {
    id: string;
    isAdmin: boolean;
  };
  task: {
    createdById: string | null;
    initiatorId: string;
    doerId: string;
    status: TaskStatus;
  };
};

/**
 * canEditTaskFields — Tier-3 (2026-05-20) widened per Manan's spec
 * ("Edit Task Option has to be given to all users at all levels").
 *
 * Anyone with a relationship to the task (creator / initiator / doer)
 * can edit its content fields while it's still in the pending lane.
 * Admins can edit at any status. Strangers — explicitly excluded —
 * still can't, since they shouldn't even see the task.
 *
 * Admin-only fields (approval_status, revised_target_date) live on
 * separate Server Actions and are gated independently of this flag.
 */
export function canEditTaskFields(input: TaskPermissionInput): boolean {
  const { employee, task } = input;
  if (employee.isAdmin) return true;
  const isPending = (PENDING_STATUSES as readonly string[]).includes(
    task.status,
  );
  if (!isPending) return false;
  if (task.createdById === employee.id) return true;
  if (task.initiatorId === employee.id) return true;
  if (task.doerId === employee.id) return true;
  return false;
}

/**
 * Compute the actor's role relative to a single task.
 * Used by every workflow-predicate below.  Falls through in order:
 * admin → doer → initiator → creator → stranger.
 */
function actorRoleFor(input: TaskPermissionInput): ActorRole {
  const { employee, task } = input;
  if (employee.isAdmin) return "admin";
  if (task.doerId === employee.id) return "doer";
  if (task.initiatorId === employee.id) return "initiator";
  if (task.createdById === employee.id) return "creator";
  return "stranger";
}

/**
 * canApprove — Task 10 approval hierarchy.
 *
 * Approve (done → approved) is allowed iff the actor is admin, the
 * initiator, OR the doer's *direct* manager (doer.managerId === me.id) —
 * and is NOT the doer themselves. Only valid while status === "done".
 * The direct-manager relationship is resolved by the caller and passed
 * in as `isDoersManager` (this module stays I/O-free).
 */
export type ApprovePermissionInput = TaskPermissionInput & {
  isDoersManager: boolean;
};

export function canApprove(input: ApprovePermissionInput): boolean {
  const { employee, task, isDoersManager } = input;
  if (task.status !== "done") return false;
  if (employee.id === task.doerId) return false;
  if (employee.isAdmin) return true;
  if (employee.id === task.initiatorId) return true;
  return isDoersManager;
}

/**
 * canDecline — Task 10. Decline (done → not_approved) is open to any
 * participant (creator / initiator / doer) or admin. No manager gate.
 * Only valid while status === "done".
 */
export function canDecline(input: TaskPermissionInput): boolean {
  const { employee, task } = input;
  if (task.status !== "done") return false;
  if (employee.isAdmin) return true;
  return (
    employee.id === task.createdById ||
    employee.id === task.initiatorId ||
    employee.id === task.doerId
  );
}

/**
 * canReassign — doer OR initiator OR admin, only in the pending lane.
 * Spec line 229.  Reassignment never affects status by itself; the
 * "reset to not_started" option is a separate flag on the Server
 * Action.  We approximate the "non-terminal + not done" rule via the
 * transition matrix: a task is reassignable iff at least one PENDING
 * status is reachable for the actor.
 */
export function canReassign(input: TaskPermissionInput): boolean {
  const role = actorRoleFor(input);
  if (role === "stranger" || role === "creator") return false;
  // Tier-3 — sourced from PENDING_STATUSES so new pending values (need_info,
  // follow_up_1/2/3) allow reassignment for doer + initiator the same way
  // legacy pending statuses do.
  const isPending = (PENDING_STATUSES as readonly string[]).includes(
    input.task.status,
  );
  if (role === "admin") return isPending || input.task.status === "not_approved";
  return isPending; // doer OR initiator in the pending lane
}

/**
 * canComment — any task participant (creator/initiator/doer) or admin,
 * regardless of status.  Spec line 231 (audit read = task participants).
 * Strangers may not comment; that would leak the task's existence.
 */
export function canComment(input: TaskPermissionInput): boolean {
  const role = actorRoleFor(input);
  return role !== "stranger";
}
