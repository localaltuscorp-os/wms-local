import { isFounderEmail } from "@/lib/auth/founder";

/**
 * WHO MAY APPROVE — pure, I/O-free predicates (same style as
 * lib/auth/task-permissions.ts) so they can be unit-tested and called from both
 * the server action and the loaders that decide whether to render a button.
 *
 * Sir's rule (2026-08):
 *   · MANAGER APPROVAL — a manager may approve work done by their own reports,
 *     for tasks handed out by an admin or a manager.
 *   · ADMIN APPROVAL — only Manan Sir.
 *
 * TWO THINGS THAT MUST NOT BE GOT WRONG:
 *
 * 1. "Only Manan" is `isFounderEmail`, NOT `isSuperAdmin`. Super-admin covers
 *    TWO people (Manan and Hetesh), so using it would silently hand final
 *    sign-off to someone the rule excludes.
 *
 * 2. UI VISIBILITY IS NOT AUTHORITY. These are also used to hide buttons, but
 *    the server action MUST re-run them against the session actor — never trust
 *    a level, an id, or a flag that arrived from the browser.
 */

export type ApprovalLevel = "none" | "manager" | "admin";

export interface ApprovalActor {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

export interface ApprovalTask {
  status: string;
  approvalLevel: ApprovalLevel;
  doerId: string;
  /** Who handed the task out (initiator, falling back to creator). */
  assignerId: string | null;
}

export interface ApprovalContext {
  /** The actor is the DIRECT manager of the task's doer. */
  isDoersManager: boolean;
  /**
   * The actor is ANYWHERE above the doer in the reporting tree — direct manager,
   * their manager, and so on. Widened from direct-only (Sir, 2026-08-21): a
   * manager may sign off work anywhere in their downline, not just one level
   * down. Computed with the recursive walk in lib/weekly-goals/hierarchy, so a
   * three-deep chain resolves the same way the goals module already resolves it.
   *
   * Kept as a SEPARATE field rather than folded into isDoersManager: the direct
   * relationship still has its own meaning elsewhere, and a caller that cannot
   * afford the recursive query can pass `isDoersManager` alone and get the old,
   * narrower behaviour rather than silently wrong permissions.
   */
  isDoersUpline?: boolean;
  /** The person who handed the task out is an admin. */
  assignerIsAdmin: boolean;
  /** The person who handed the task out manages at least one person. */
  assignerIsManager: boolean;
}

/** Nobody signs off their own work, at any level. */
function isSelf(actor: ApprovalActor, task: ApprovalTask): boolean {
  return actor.id === task.doerId;
}

/**
 * MANAGER approval: the doer's manager (or an admin, who sits above them) may
 * accept work that is DONE and not yet approved at any level — provided the task
 * was handed out by an admin or a manager, which is Sir's "tasks given by Admin
 * or Manager".
 */
export function canManagerApprove(
  actor: ApprovalActor,
  task: ApprovalTask,
  ctx: ApprovalContext,
): boolean {
  if (isSelf(actor, task)) return false;
  if (task.status !== "done") return false;
  if (task.approvalLevel !== "none") return false;
  if (!(ctx.assignerIsAdmin || ctx.assignerIsManager)) return false;
  return actor.isAdmin || ctx.isDoersManager || ctx.isDoersUpline === true;
}

/**
 * ADMIN approval: Manan only. It may follow a manager sign-off OR skip straight
 * from `done` (not every task needs both stages — the NULL manager_* stamps are
 * themselves the record that the manager stage was skipped).
 *
 * He may not admin-approve a task he DID himself: that would be self-approval.
 * Such a task stops at Manager Approved, which is a complete, valid state.
 */
export function canAdminApprove(actor: ApprovalActor, task: ApprovalTask): boolean {
  if (!isFounderEmail(actor.email)) return false;
  if (isSelf(actor, task)) return false;
  if (task.approvalLevel === "admin") return false;
  return task.status === "done" || task.approvalLevel === "manager";
}

/** Sending work back at the manager stage — a slightly wider set than approving,
 *  mirroring how `canDecline` is wider than `canApprove` today. */
export function canManagerSendBack(
  actor: ApprovalActor,
  task: ApprovalTask,
  ctx: ApprovalContext,
): boolean {
  if (task.status !== "done" || task.approvalLevel !== "none") return false;
  return (
    actor.isAdmin ||
    ctx.isDoersManager ||
    ctx.isDoersUpline === true ||
    actor.id === task.assignerId
  );
}

/**
 * Only Manan may reverse a sign-off — including his OWN admin approval, so an
 * admin-approved task is never a dead end that has to be fixed in the database.
 */
export function canAdminSendBack(actor: ApprovalActor, task: ApprovalTask): boolean {
  if (!isFounderEmail(actor.email)) return false;
  return (
    task.approvalLevel === "manager" ||
    task.approvalLevel === "admin" ||
    task.status === "done"
  );
}

/* `approvalColumnOf()` used to live here, mapping an approval level onto the
   synthetic `manager_approved` / `admin_approved` Kanban columns. Nothing ever
   called it, and those columns are gone — the board has one `approved` column
   again (see lib/kanban-columns.ts). The approval LEVEL itself is unaffected;
   it is still what the functions above rule on. */
