"use server";

import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { afterResponse } from "@/lib/after";
import { emit, emitMany } from "@/lib/events/emit";
import {
  taskArchived,
  taskRestored,
  taskReassigned,
  taskFieldUpdated,
  taskApprovalDecided,
  taskDeleted,
  taskStatusChanged,
} from "@/lib/events/task-events";
import { nudgeRelay } from "@/lib/relay/nudge";
import { db, tasks } from "@/lib/db";
import { reconcileTaskEvent, removeTaskEvent } from "@/lib/google/sync";
import { syncTaskToGoal } from "@/lib/weekly-goals/task-sync";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  APPROVAL_STATUSES,
  type TaskStatus,
  type TaskPriority,
  type ApprovalStatus,
} from "@/db/enums";
import {
  CreateTaskSchema,
  type CreateTaskInput,
  EditTaskFieldsSchema,
  type EditTaskFieldsInput,
  ApproveSchema,
  type ApproveInput,
  type ApproveParsed,
  ReassignSchema,
  type ReassignInput,
  CommentSchema,
  type CommentInput,
  SetApprovalStatusSchema,
  type SetApprovalStatusInput,
  SetRevisedTargetDateSchema,
  type SetRevisedTargetDateInput,
} from "@/lib/validators/task";
import { taskEvents, clients, subjects, employees } from "@/db/schema";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";
import { CreateClientSchema } from "@/lib/validators/client";
import { CreateSubjectSchema } from "@/lib/validators/subject";
import { requireUser, requireWeeklyGoalsFilled } from "@/lib/auth/current";
import { canChangeDoerFor } from "@/lib/auth/doer-permission";

/** One wording for all three doer paths, so the refusal reads the same wherever it is hit. */
const DOER_DENIED = "Only managers, Manan and Om can change a task's doer.";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import {
  canManagerApprove,
  canAdminApprove,
  canManagerSendBack,
  canAdminSendBack,
} from "@/lib/tasks/approval-permissions";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  canEditTaskFields,
  canApprove,
  canDecline,
  canReassign,
  canComment,
} from "@/lib/auth/task-permissions";
import { canTransitionTo, type ActorRole } from "@/lib/auth/status-transitions";
import {
  EDITABLE_TASK_FIELDS,
  type EditableTaskField,
} from "@/lib/events";
import {
  notify,
  notifyManyForTask,
  dedupeRecipients,
} from "@/lib/notifications/dispatch";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import {
  applyTaskStatusChange,
  optimisticLockMatches,
  taskLabel,
} from "@/lib/tasks/set-status";
import { addTaskComment } from "@/lib/tasks/add-comment";
import { createTasksCore } from "@/lib/tasks/create-task";
import { nudgeTaskCore } from "@/lib/tasks/nudge";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Optimistic-lock predicate that survives Postgres↔JS timestamp drift.
 *
 * Postgres stores `timestamptz` at microsecond precision; postgres.js parses
 * timestamps into JS Date (millisecond precision, sub-ms truncated) and
 * serializes Date parameters back via `.toISOString()` (also ms). So
 * `eq(tasks.updated_at, expectedDate)` fails for any row whose `updated_at`
 * was written by Postgres `now()` (defaultNow inserts, legacy imports, etc.) —
 * the stored `.123456` never equals the round-tripped `.123000`. Truncating
 * the stored column to milliseconds before comparing closes the gap without
 * needing to migrate every row or alter the column type.
 *
 * We pass the parameter as an ISO-8601 string with an explicit `::timestamptz`
 * cast because raw `Date` interpolation inside `sql\`\`` would call
 * `.toString()` ("Fri May 15 2026 12:43:38 GMT+0530") which Postgres cannot
 * parse — Drizzle only knows to call `.toISOString()` when the column type
 * is in scope, which it isn't inside an arbitrary SQL fragment.
 */
function revalidateTaskRoutes(): void {
  revalidatePath("/tasks");
  revalidatePath("/archived");
  // NOTE: `revalidatePath("/")` removed (Operation Butter P0). It force-busted
  // the dashboard route on every task write; the exec dashboard now serves from
  // its own `dashboard` tag (60s TTL) and doesn't need per-write invalidation.
  // Drop cached task aggregates (nav-count totals, distinct-subject list).
  // Subject cache is touched too because creating a task with a new free-text
  // subject expands the dropdown's distinct list. `updateTag` is the Next 16
  // server-action-scoped variant that gives read-your-own-writes — the
  // redirect/refresh that follows this action will see fresh data.
  updateTag(CACHE_TAGS.tasks);
  updateTag(CACHE_TAGS.subjects);
}

export async function archiveTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  if (!me.isAdmin) {
    return { ok: false, error: "Only admins can archive a task." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    const found = await db.transaction(async (tx) => {
      const updated = await tx
        .update(tasks)
        .set({ archived: true })
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id, doerId: tasks.doerId });
      if (updated.length === 0) return false;
      await tx.insert(taskEvents).values({
        taskId,
        actorId: me.id,
        eventType: "archived",
        fromValue: null,
        toValue: null,
      });
      await emit(tx, taskArchived(taskId, { doerId: updated[0]!.doerId }, { actorId: me.id }));
      return true;
    });
    if (!found) return { ok: false, error: "Task not found — it may already be gone." };
  } catch (err) {
    return { ok: false, error: `Could not archive: ${(err as Error).message}` };
  }
  nudgeRelay();
  // Deferred (persist-then-return): calendar teardown runs after the response.
  // reconcileTaskEvent never throws + records retry state + the daily cron is a
  // backstop, so deferring is safe and the archive returns instantly.
  afterResponse(() => reconcileTaskEvent(taskId)); // remove from the doer's calendar
  revalidateTaskRoutes();
  return { ok: true };
}

/**
 * Permanently delete a task. Destructive + irreversible — so it is
 * ADMIN-ONLY (everyone else uses Archive or Cancel). FK constraints handle
 * the cleanup: task_events + notifications cascade-delete with the row, and
 * any linked documents are unlinked (task_id → null). For the soft path,
 * use archiveTask / setTaskStatus("cancelled").
 */
export async function deleteTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  if (!me.isAdmin) {
    return { ok: false, error: "Only admins can permanently delete a task." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Grab the calendar pointers + doer before the row (and its columns) are gone.
  const doomed = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { googleEventId: true, googleSyncedDoerId: true, doerId: true },
  });

  try {
    // Delete + emit in one txn (Law 2): the TaskDeleted event survives the row
    // (the log has no FK on aggregate_id — events outlive aggregates, Law 3).
    const deleted = await db.transaction(async (tx) => {
      const d = await tx
        .delete(tasks)
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id });
      if (d.length === 0) return d;
      await emit(tx, taskDeleted(taskId, { doerId: doomed?.doerId ?? "" }, { actorId: me.id }));
      return d;
    });
    if (deleted.length === 0) {
      return { ok: false, error: "Task not found — it may already be deleted." };
    }
  } catch (err) {
    return { ok: false, error: `Could not delete: ${(err as Error).message}` };
  }
  nudgeRelay();

  if (doomed?.googleEventId) {
    // Inline: the row is gone after this, so the daily cron can't catch a missed
    // teardown — do it reliably in the request context. removeTaskEvent never throws.
    await removeTaskEvent({
      googleEventId: doomed.googleEventId,
      googleSyncedDoerId: doomed.googleSyncedDoerId,
    });
  }
  revalidateTaskRoutes();
  return { ok: true };
}

export async function unarchiveTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  const me = await requireUser();
  if (!me.isAdmin) {
    return { ok: false, error: "Only admins can restore a task from the archive." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    const found = await db.transaction(async (tx) => {
      const updated = await tx
        .update(tasks)
        .set({ archived: false })
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id, doerId: tasks.doerId });
      if (updated.length === 0) return false;
      await tx.insert(taskEvents).values({
        taskId,
        actorId: me.id,
        eventType: "restored",
        fromValue: null,
        toValue: null,
      });
      await emit(tx, taskRestored(taskId, { doerId: updated[0]!.doerId }, { actorId: me.id }));
      return true;
    });
    if (!found) return { ok: false, error: "Task not found — it may already be gone." };
  } catch (err) {
    return { ok: false, error: `Could not restore: ${(err as Error).message}` };
  }
  nudgeRelay();
  // Deferred (persist-then-return) — see archiveTask. Safe via retry state + cron.
  afterResponse(() => reconcileTaskEvent(taskId)); // re-add to the doer's calendar
  revalidateTaskRoutes();
  return { ok: true };
}

/**
 * Move the task to a new status.  Honours the transition matrix
 * (lib/auth/status-transitions.ts) — refuses transitions the actor's
 * role can't perform.  Writes a `status_changed` audit event with the
 * from + to values.  Optimistic-lock: caller passes the expected
 * updated_at so concurrent edits cleanly fail with "stale".
 */
export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
  expectedUpdatedAt: string,
  note?: string,
): Promise<
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };

  // Delegate to the transport-agnostic core (shared with the mobile API so the
  // permission matrix + audit + notifications never diverge between clients).
  const result = await applyTaskStatusChange(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
    status,
    expectedUpdatedAt,
    note,
  );
  if (!result.ok) return result;

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  // Surface the fresh optimistic-lock token so the client can make a follow-up
  // change WITHOUT a round-trip refresh first (Operation Butter P1) — otherwise
  // a rapid second flip ships the stale `updatedAt` and bounces with "stale".
  return { ok: true, updatedAt: result.updatedAt };
}

export async function setTaskPriority(
  taskId: string,
  priority: TaskPriority,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  if (!TASK_PRIORITIES.includes(priority))
    return { ok: false, error: "Unknown priority." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    const outcome = await db.transaction(async (tx) => {
      // SELECT ... FOR UPDATE serialises concurrent edits on the same row:
      // two simultaneous priority changes would otherwise both read the same
      // `priority`, both pass the idempotency check, and both write — last
      // writer silently wins. The row lock blocks the second txn until the
      // first commits.
      const locked = await tx
        .select({
          priority: tasks.priority,
          createdById: tasks.createdById,
          initiatorId: tasks.initiatorId,
          doerId: tasks.doerId,
          status: tasks.status,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .for("update");
      const current = locked[0];
      if (!current) return "not-found" as const;
      // AUTHZ (was MISSING): no participant/admin gate — any employee could set
      // the priority on any task. Require the same edit permission as other fields.
      if (
        !canEditTaskFields({
          employee: { id: me.id, isAdmin: me.isAdmin },
          task: {
            createdById: current.createdById,
            initiatorId: current.initiatorId,
            doerId: current.doerId,
            status: current.status,
          },
        })
      ) {
        return "forbidden" as const;
      }
      if (current.priority === priority) return "noop" as const; // idempotent
      const updated = await tx
        .update(tasks)
        .set({ priority })
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id });
      if (updated.length === 0) return "not-found" as const;
      await tx.insert(taskEvents).values({
        taskId,
        actorId: me.id,
        eventType: "priority_changed",
        fromValue: { priority: current.priority },
        toValue: { priority },
      });
      return "ok" as const;
    });
    if (outcome === "not-found") return { ok: false, error: "Task not found." };
    if (outcome === "forbidden")
      return { ok: false, error: "You don't have permission to change this task's priority." };
  } catch (err) {
    return { ok: false, error: `Could not change priority: ${(err as Error).message}` };
  }
  revalidateTaskRoutes();
  return { ok: true };
}

/**
 * #7 — My Day kanban: drag a task onto a day column to reschedule it.
 * Writes revised_target_date (noon IST of the target day), NOT due_at — the
 * first committed due date stays permanent; a reschedule is a REVISION (overdue
 * + the board's day bucket both read the effective due = revised ?? due_at).
 * Returns a typed result so the board can toast on failure instead of crashing.
 */
export async function rescheduleTask(
  taskId: string,
  dueYmd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd))
    return { ok: false, error: "Invalid date." };
  const me = await requireUser();
  if (!me.isAdmin) {
    return { ok: false, error: "Only admins can reschedule a task." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const revisedTargetDate = new Date(`${dueYmd}T12:00:00+05:30`);
  if (isNaN(revisedTargetDate.getTime())) return { ok: false, error: "Invalid date." };

  try {
    const updated = await db
      .update(tasks)
      .set({ revisedTargetDate })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (updated.length === 0) return { ok: false, error: "Task not found." };
  } catch (err) {
    return { ok: false, error: `Could not reschedule: ${(err as Error).message}` };
  }

  revalidateTaskRoutes();
  return { ok: true };
}

export async function reassignDoer(
  taskId: string,
  doerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Invalid task id." };
  if (!isUuid(doerId)) return { ok: false, error: "Invalid employee id." };
  const me = await requireUser();
  // WHO MAY REASSIGN (Sir): managers, Manan and Om — see canChangeDoerFor.
  // else, but hiding a control is presentation — this is the boundary. Every
  // path that writes tasks.doerId carries the same check: here, bulkReassignDoer
  // and reassignTask.
  if (!(await canChangeDoerFor(me))) {
    return { ok: false, error: DOER_DENIED };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    const outcome = await db.transaction(async (tx) => {
      // FOR UPDATE so two concurrent reassigns serialise — see
      // setTaskPriority for the rationale.
      const locked = await tx
        .select({
          doerId: tasks.doerId,
          createdById: tasks.createdById,
          initiatorId: tasks.initiatorId,
          status: tasks.status,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .for("update");
      const current = locked[0];
      if (!current) return "not-found" as const;
      // AUTHZ (was MISSING): this trusted a client taskId with no permission
      // check — any employee could reassign anyone's task, bypassing the
      // approval hierarchy. Gate exactly like reassignTask.
      if (
        !canReassign({
          employee: { id: me.id, isAdmin: me.isAdmin },
          task: {
            createdById: current.createdById,
            initiatorId: current.initiatorId,
            doerId: current.doerId,
            status: current.status,
          },
        })
      ) {
        return "forbidden" as const;
      }
      if (current.doerId === doerId) return "noop" as const; // idempotent
      const updated = await tx
        .update(tasks)
        .set({ doerId })
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id });
      if (updated.length === 0) return "not-found" as const;
      await tx.insert(taskEvents).values({
        taskId,
        actorId: me.id,
        eventType: "reassigned",
        fromValue: { doerId: current.doerId },
        toValue: { doerId },
      });
      await emit(
        tx,
        taskReassigned(
          taskId,
          { fromDoerId: current.doerId, toDoerId: doerId, resetStatus: false },
          { actorId: me.id },
        ),
      );
      return "ok" as const;
    });
    if (outcome === "not-found") return { ok: false, error: "Task not found." };
    if (outcome === "forbidden")
      return { ok: false, error: "You don't have permission to reassign this task." };
  } catch (err) {
    return { ok: false, error: `Could not reassign: ${(err as Error).message}` };
  }
  nudgeRelay();
  // Move the event off the old doer's calendar and onto the new doer's.
  // Deferred (persist-then-return) — safe via retry state + daily cron.
  afterResponse(() => reconcileTaskEvent(taskId));
  revalidateTaskRoutes();
  return { ok: true };
}

// ───────────────────────── Bulk / multi-select actions ─────────────────────
//
// Power the task-list "select many → act" toolbar. Each takes an array of
// task ids, applies ONE rate-limit check (not per-row), batches the DB writes
// (`inArray`), writes one audit row per task, and revalidates once.
//
// Permissions mirror the single-task actions: status honours the transition
// matrix per task (rows the actor can't move are skipped, not failed);
// priority + reassign are open to any signed-in user; archive + delete are
// admin-only. Bulk ops intentionally DON'T fan out per-task notifications — a
// 50-task sweep would flood every participant's inbox (single-task actions
// still notify).

const MAX_BULK = 500;

type BulkResult =
  | { ok: true; updated: number; skipped: number }
  | { ok: false; error: string };

function parseBulkIds(taskIds: unknown): string[] | null {
  if (!Array.isArray(taskIds)) return null;
  const ids = Array.from(
    new Set(taskIds.filter((x): x is string => typeof x === "string")),
  );
  if (ids.length === 0 || ids.length > MAX_BULK) return null;
  if (!ids.every(isUuid)) return null;
  return ids;
}

export async function bulkSetStatus(
  taskIds: string[],
  status: TaskStatus,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  if (!TASK_STATUSES.includes(status))
    return { ok: false, error: "Unknown status." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      doerId: tasks.doerId,
      initiatorId: tasks.initiatorId,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));

  // Honour the transition matrix per task; silently skip rows this actor's
  // role can't move (reported back as `skipped`).
  const prevStatus = new Map(rows.map((r) => [r.id, r.status]));
  const doerById = new Map(rows.map((r) => [r.id, r.doerId]));
  const allowed = rows
    .filter((r) => {
      const role: ActorRole = me.isAdmin
        ? "admin"
        : r.doerId === me.id
          ? "doer"
          : r.initiatorId === me.id
            ? "initiator"
            : r.createdById === me.id
              ? "creator"
              : "stranger";
      return canTransitionTo(r.status, status, role);
    })
    .map((r) => r.id);

  if (allowed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ status, updatedAt: now, completedAt: status === "done" ? now : null })
        .where(inArray(tasks.id, allowed));
      await tx.insert(taskEvents).values(
        allowed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "status_changed" as const,
          fromValue: { status: prevStatus.get(id) },
          toValue: { status },
        })),
      );
      await emitMany(
        tx,
        allowed.map((id) =>
          taskStatusChanged(
            id,
            {
              doerId: doerById.get(id) ?? "",
              fromStatus: prevStatus.get(id) ?? "",
              toStatus: status,
            },
            { actorId: me.id },
          ),
        ),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  nudgeRelay();
  for (const id of allowed) afterResponse(() => reconcileTaskEvent(id));
  // Phase 2 — mirror status back onto any goal these tasks were spun off from.
  for (const id of allowed) afterResponse(() => syncTaskToGoal(id, status));
  revalidateTaskRoutes();
  return { ok: true, updated: allowed.length, skipped: ids.length - allowed.length };
}

/**
 * Batch version of `setTaskApprovalStatus` — admin-only, same as the
 * single-task action it mirrors.
 *
 * WHY THIS AND NOT `bulkSetStatus`: approved / not_approved / cancelled are
 * verdicts, and verdicts live in `approval_status`, not `status` (see the
 * Tier-3 note further down — the doer's lifecycle stays independent of the
 * admin's ruling). `cancelled` in particular is a DEPRECATED value of `status`
 * and is filtered out of every picker, so routing "Mark Cancelled" through
 * bulkSetStatus would write a retired value nothing renders.
 *
 * Rows already carrying the verdict are counted as `skipped` rather than
 * rewritten, so the audit trail doesn't fill with no-op entries.
 */
export async function bulkSetApprovalStatus(
  taskIds: string[],
  approvalStatus: ApprovalStatus,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  if (!APPROVAL_STATUSES.includes(approvalStatus))
    return { ok: false, error: "Unknown approval status." };
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Admins only." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({ id: tasks.id, approvalStatus: tasks.approvalStatus })
    .from(tasks)
    .where(inArray(tasks.id, ids));

  const prev = new Map(rows.map((r) => [r.id, r.approvalStatus]));
  const allowed = rows
    .filter((r) => r.approvalStatus !== approvalStatus)
    .map((r) => r.id);

  if (allowed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ approvalStatus, updatedAt: now })
        .where(inArray(tasks.id, allowed));
      await tx.insert(taskEvents).values(
        allowed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "field_updated" as const,
          fromValue: { field: "approvalStatus", value: prev.get(id) ?? null },
          toValue: { field: "approvalStatus", value: approvalStatus },
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  revalidateTaskRoutes();
  return { ok: true, updated: allowed.length, skipped: ids.length - allowed.length };
}

export async function bulkSetPriority(
  taskIds: string[],
  priority: TaskPriority,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  if (!TASK_PRIORITIES.includes(priority))
    return { ok: false, error: "Unknown priority." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({ id: tasks.id, priority: tasks.priority })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  const prev = new Map(rows.map((r) => [r.id, r.priority]));
  const changed = rows.filter((r) => r.priority !== priority).map((r) => r.id);
  if (changed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.transaction(async (tx) => {
      await tx.update(tasks).set({ priority }).where(inArray(tasks.id, changed));
      await tx.insert(taskEvents).values(
        changed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "priority_changed" as const,
          fromValue: { priority: prev.get(id) },
          toValue: { priority },
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  revalidateTaskRoutes();
  return { ok: true, updated: changed.length, skipped: ids.length - changed.length };
}

export async function bulkReassignDoer(
  taskIds: string[],
  doerId: string,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  if (!isUuid(doerId)) return { ok: false, error: "Invalid doer." };
  const me = await requireUser();
  // Same rule as reassignDoer — and note this action previously had NO
  // permission check at all beyond being signed in, so it was the widest of
  // the three doer paths. Reassigning fifty tasks at once is no less an
  // allocation decision than reassigning one.
  if (!(await canChangeDoerFor(me))) {
    return { ok: false, error: DOER_DENIED };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [target] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, doerId), eq(employees.isActive, true)))
    .limit(1);
  if (!target) return { ok: false, error: "That employee can't take tasks." };

  const rows = await db
    .select({ id: tasks.id, doerId: tasks.doerId })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  const prev = new Map(rows.map((r) => [r.id, r.doerId]));
  const changed = rows.filter((r) => r.doerId !== doerId).map((r) => r.id);
  if (changed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.transaction(async (tx) => {
      await tx.update(tasks).set({ doerId }).where(inArray(tasks.id, changed));
      await tx.insert(taskEvents).values(
        changed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "reassigned" as const,
          fromValue: { doerId: prev.get(id) },
          toValue: { doerId },
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not reassign: ${(err as Error).message}` };
  }
  for (const id of changed) afterResponse(() => reconcileTaskEvent(id));
  revalidateTaskRoutes();
  return { ok: true, updated: changed.length, skipped: ids.length - changed.length };
}

export async function bulkSetSubject(
  taskIds: string[],
  subject: string,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  const value = typeof subject === "string" ? subject.trim() : "";
  if (!value || value.length > 80)
    return { ok: false, error: "Invalid subject." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({
      id: tasks.id,
      subject: tasks.subject,
      createdById: tasks.createdById,
      initiatorId: tasks.initiatorId,
      doerId: tasks.doerId,
      status: tasks.status,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  const prev = new Map(rows.map((r) => [r.id, r.subject]));
  // AUTHZ (was MISSING): only overwrite tasks the caller may edit — the single-
  // task path gates via canEditTaskFields; the bulk path let anyone rewrite any
  // task's subject. Non-editable tasks are silently skipped.
  const changed = rows
    .filter((r) => r.subject !== value)
    .filter((r) =>
      canEditTaskFields({
        employee: { id: me.id, isAdmin: me.isAdmin },
        task: { createdById: r.createdById, initiatorId: r.initiatorId, doerId: r.doerId, status: r.status },
      }),
    )
    .map((r) => r.id);
  if (changed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ subject: value, updatedAt: new Date() })
        .where(inArray(tasks.id, changed));
      await tx.insert(taskEvents).values(
        changed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "field_updated" as const,
          fromValue: { field: "subject", value: prev.get(id) ?? null },
          toValue: { field: "subject", value },
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  revalidateTaskRoutes();
  return { ok: true, updated: changed.length, skipped: ids.length - changed.length };
}

export async function bulkSetClient(
  taskIds: string[],
  client: string,
): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  const value = typeof client === "string" ? client.trim() : "";
  if (!value || value.length > 120)
    return { ok: false, error: "Invalid client." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({
      id: tasks.id,
      client: tasks.client,
      createdById: tasks.createdById,
      initiatorId: tasks.initiatorId,
      doerId: tasks.doerId,
      status: tasks.status,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  const prev = new Map(rows.map((r) => [r.id, r.client]));
  // AUTHZ (was MISSING): restrict to tasks the caller may edit (see bulkSetSubject).
  const changed = rows
    .filter((r) => r.client !== value)
    .filter((r) =>
      canEditTaskFields({
        employee: { id: me.id, isAdmin: me.isAdmin },
        task: { createdById: r.createdById, initiatorId: r.initiatorId, doerId: r.doerId, status: r.status },
      }),
    )
    .map((r) => r.id);
  if (changed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ client: value, updatedAt: new Date() })
        .where(inArray(tasks.id, changed));
      await tx.insert(taskEvents).values(
        changed.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "field_updated" as const,
          fromValue: { field: "client", value: prev.get(id) ?? null },
          toValue: { field: "client", value },
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` };
  }
  revalidateTaskRoutes();
  return { ok: true, updated: changed.length, skipped: ids.length - changed.length };
}

export async function bulkArchive(taskIds: string[]): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only admins can archive tasks." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inArray(tasks.id, ids), eq(tasks.archived, false)));
  const toArchive = rows.map((r) => r.id);
  if (toArchive.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.transaction(async (tx) => {
      await tx.update(tasks).set({ archived: true }).where(inArray(tasks.id, toArchive));
      await tx.insert(taskEvents).values(
        toArchive.map((id) => ({
          taskId: id,
          actorId: me.id,
          eventType: "archived" as const,
          fromValue: null,
          toValue: null,
        })),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not archive: ${(err as Error).message}` };
  }
  for (const id of toArchive) afterResponse(() => reconcileTaskEvent(id));
  revalidateTaskRoutes();
  return { ok: true, updated: toArchive.length, skipped: ids.length - toArchive.length };
}

export async function bulkDelete(taskIds: string[]): Promise<BulkResult> {
  const ids = parseBulkIds(taskIds);
  if (!ids) return { ok: false, error: "Invalid selection." };
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only admins can delete tasks." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Capture calendar pointers before the rows (and their columns) are gone.
  const doomed = await db
    .select({
      id: tasks.id,
      googleEventId: tasks.googleEventId,
      googleSyncedDoerId: tasks.googleSyncedDoerId,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  if (doomed.length === 0) return { ok: true, updated: 0, skipped: ids.length };

  try {
    await db.delete(tasks).where(inArray(tasks.id, doomed.map((d) => d.id)));
  } catch (err) {
    return { ok: false, error: `Could not delete: ${(err as Error).message}` };
  }
  for (const d of doomed) {
    if (d.googleEventId) {
      afterResponse(() =>
        removeTaskEvent({
          googleEventId: d.googleEventId,
          googleSyncedDoerId: d.googleSyncedDoerId,
        }),
      );
    }
  }
  revalidateTaskRoutes();
  return { ok: true, updated: doomed.length, skipped: ids.length - doomed.length };
}

export async function createTask(input: CreateTaskInput): Promise<
  | { ok: true; id: string; ids: string[] }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  // Defense-in-depth weekly-goals fill gate (design §11): a user with un-filled
  // current-week goals can't create new work by POSTing past the layout
  // redirect. Applies to everyone incl. super-admins. Throws when gated.
  await requireWeeklyGoalsFilled(me);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Delegate to the shared core (same rules as the mobile create API).
  const result = await createTasksCore({ id: me.id, name: me.name }, input);
  if (!result.ok) return result;

  revalidateTaskRoutes();
  return result;
}

/* ------------------------------------------------------------------ */
/* Bulk create — the in-app Excel grid / paste importer (mirrors the   */
/* Goals bulkCreateGoals). Each row may name several doers → one task  */
/* per doer (fan-out via createTasksCore). All rows are already parsed  */
/* + reviewed on the client; here we re-validate and insert.           */
/* ------------------------------------------------------------------ */

const uuidStr = z.string().uuid("Must be a UUID");

const BulkTaskRowSchema = z.object({
  title: z.string().trim().min(1, "Client name is required").max(240),
  subject: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(8000).nullish(),
  priority: z.enum(TASK_PRIORITIES),
  /** ISO-8601 datetime (the grid sends the picked date at noon UTC). */
  dueAt: z.string().datetime("Due date is required"),
  doerIds: z.array(uuidStr).min(1, "Pick at least one Doer").max(50),
  initiatorId: uuidStr,
});

const BulkCreateTasksSchema = z.object({
  rows: z.array(BulkTaskRowSchema).min(1, "Add at least one task").max(200),
});

export type BulkTaskRowInput = z.input<typeof BulkTaskRowSchema>;

/**
 * Create many tasks at once from the in-app bulk grid / pasted rows. Applies the
 * same gate + rate limit as the single create, then fans each row out through
 * the shared `createTasksCore` (so short-id, audit, notifications and calendar
 * sync all stay identical). Partial success is reported: `created` = total tasks
 * inserted (a row with N doers counts N), `failed` carries per-row messages.
 */
export async function bulkCreateTasks(
  input: z.input<typeof BulkCreateTasksSchema>,
): Promise<
  | { ok: true; created: number; rows: number; failed: string[] }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  // Same defense-in-depth weekly-goals gate as the single create.
  await requireWeeklyGoalsFilled(me);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BulkCreateTasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let created = 0;
  const failed: string[] = [];
  for (const [i, r] of parsed.data.rows.entries()) {
    const res = await createTasksCore(
      { id: me.id, name: me.name },
      {
        title: r.title,
        subject: r.subject ?? null,
        description: r.description ?? null,
        doerIds: r.doerIds,
        initiatorId: r.initiatorId,
        priority: r.priority,
        dueAt: r.dueAt,
      },
    );
    if (res.ok) created += res.ids.length;
    else failed.push(`Row ${i + 1}: ${res.error}`);
  }

  revalidateTaskRoutes();
  if (created === 0) {
    return { ok: false, error: failed[0] ?? "No tasks were created." };
  }
  return { ok: true, created, rows: parsed.data.rows.length, failed };
}

/**
 * Appends a new client to the shared roster, used by the "+ Add new
 * client…" affordance on the task forms.
 *
 * ADMINS AND SUPER-ADMINS ONLY (Sir). This used to accept any authenticated
 * user, so the roster every task form picks from could be grown by anyone — and
 * a misspelling added here becomes a permanent second client that quietly
 * splits a client's task history in two. The picker hides the affordance for
 * everyone else; this is the check that actually holds. Membership is decided by
 * `canAddTaskRoster` — is_admin OR the super-admin allow-list, which are not the
 * same set.
 *
 * Case-insensitive dedupe: if the name already exists we return the
 * canonical stored spelling instead of erroring, so the picker can just
 * select it.
 */
export async function quickAddClient(
  rawName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!canAddTaskRoster(me)) {
    return { ok: false, error: "Only an admin can add a new client." };
  }

  const parsed = CreateClientSchema.safeParse({ name: rawName });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.name;

  const existing = await db
    .select({ name: clients.name })
    .from(clients)
    .where(sql`lower(${clients.name}) = lower(${name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: true, name: existing[0].name };
  }

  try {
    const [row] = await db
      .insert(clients)
      .values({ name })
      .returning({ name: clients.name });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateTaskRoutes();
    revalidatePath("/tasks/new");
    // Bust the cached client list so the picker picks up the new name.
    updateTag(CACHE_TAGS.clients);
    return { ok: true, name: row.name };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Lost a race to a concurrent insert — fetch the winner and return it.
    if (msg.includes("clients_name_unique")) {
      const [winner] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(sql`lower(${clients.name}) = lower(${name})`)
        .limit(1);
      if (winner) return { ok: true, name: winner.name };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * Appends a new subject to the shared roster, used by the "+ Add new
 * subject…" affordance on the task forms. ADMINS AND SUPER-ADMINS ONLY,
 * mirroring quickAddClient — same reasoning, same enforcement point.
 */
export async function quickAddSubject(
  rawName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!canAddTaskRoster(me)) {
    return { ok: false, error: "Only an admin can add a new subject." };
  }

  const parsed = CreateSubjectSchema.safeParse({ name: rawName });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.name;

  const existing = await db
    .select({ name: subjects.name })
    .from(subjects)
    .where(sql`lower(${subjects.name}) = lower(${name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: true, name: existing[0].name };
  }

  try {
    const [row] = await db
      .insert(subjects)
      .values({ name })
      .returning({ name: subjects.name });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateTaskRoutes();
    revalidatePath("/tasks/new");
    return { ok: true, name: row.name };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("subjects_name_unique")) {
      const [winner] = await db
        .select({ name: subjects.name })
        .from(subjects)
        .where(sql`lower(${subjects.name}) = lower(${name})`)
        .limit(1);
      if (winner) return { ok: true, name: winner.name };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * Edits the editable subset of fields on a task.
 *
 * Optimistic-concurrency: caller passes `expectedUpdatedAt`; if the
 * row's current `updated_at` differs, the update affects zero rows
 * and we return `{ ok: false, error: "stale" }`.  The caller should
 * reload the page.
 *
 * Permission: creator OR initiator (while pending) OR admin.
 * RLS is the canonical defense; we also guard in app code so the
 * user gets a sensible message instead of an opaque DB error.
 */
export async function editTaskFields(
  taskId: string,
  fields: EditTaskFieldsInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "stale"; message?: string }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };

  let parsed;
  try {
    parsed = EditTaskFieldsSchema.parse(fields);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canEditTaskFields({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  // Compute diff against current row.  Only changed fields go into the
  // update + audit rows.  zod has already trimmed strings and parsed
  // dueAt into a Date.
  //
  // `dueAt` is special-cased OUT of the generic loop: the first committed
  // due date is permanent (immutable for audit), so a "due date" edit must
  // never touch `tasks.due_at` — it writes `revised_target_date` instead.
  // We compare the submitted date against the CURRENT effective due
  // (revised ?? original) and, if it differs, fold a `revisedTargetDate`
  // change into the same update + one audit row.
  const diff: Partial<Record<EditableTaskField, unknown>> = {};
  for (const field of EDITABLE_TASK_FIELDS) {
    if (field === "dueAt") continue; // handled separately below
    if (!(field in parsed)) continue;
    const next = (parsed as Record<string, unknown>)[field];
    const prev = (current as Record<string, unknown>)[field];

    const a = next instanceof Date ? next.toISOString() : next;
    const b = prev instanceof Date ? prev.toISOString() : prev;
    if (a !== b) diff[field] = next;
  }

  // Due-date edit → revised target date. The user edits the *effective* due
  // (the form pre-fills with revised ?? due_at), so compare against that.
  const currentRevised = current.revisedTargetDate ?? null;
  const currentEffectiveDue = currentRevised ?? current.dueAt ?? null;
  let revisedChange: { value: Date } | null = null;
  if (parsed.dueAt instanceof Date) {
    const submittedIso = parsed.dueAt.toISOString();
    const effectiveIso =
      currentEffectiveDue instanceof Date ? currentEffectiveDue.toISOString() : null;
    if (submittedIso !== effectiveIso) {
      revisedChange = { value: parsed.dueAt };
    }
  }

  if (Object.keys(diff).length === 0 && !revisedChange) {
    // No-op: nothing to update.  Treat as success.
    return { ok: true };
  }

  // Optimistic lock + bump updated_at in one statement.
  const now = new Date();
  const updated = await db
    .update(tasks)
    // The "Client Name" field edits `title`; mirror it into `client` (not an
    // audited field of its own) so sort/group stay correct after an edit.
    .set({
      ...(diff as Partial<typeof tasks.$inferInsert>),
      ...("title" in diff ? { client: parsed.title } : {}),
      // A due-date edit revises the target date; due_at stays immutable.
      ...(revisedChange ? { revisedTargetDate: revisedChange.value } : {}),
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    return { ok: false, error: "stale" };
  }

  // One audit row per changed field.
  for (const [field, value] of Object.entries(diff)) {
    const fromValue = (current as Record<string, unknown>)[field];
    await db.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "field_updated",
      fromValue: {
        field,
        value: fromValue instanceof Date ? fromValue.toISOString() : fromValue,
      },
      toValue: {
        field,
        value: value instanceof Date ? (value as Date).toISOString() : value,
      },
    });
  }

  // Audit the revised-target-date change as a single field_updated event.
  if (revisedChange) {
    await db.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "field_updated",
      fromValue: {
        field: "revisedTargetDate",
        value: currentRevised ? currentRevised.toISOString() : null,
      },
      toValue: {
        field: "revisedTargetDate",
        value: revisedChange.value.toISOString(),
      },
    });
  }

  // Phase B: mirror the field edits into the event log (best-effort — these
  // FieldUpdated events aren't projection-critical, and updateTask isn't itself
  // transactional, so they ride the same non-txn path as the audit rows above).
  try {
    const fieldEvents = Object.entries(diff).map(([field, value]) =>
      taskFieldUpdated(
        taskId,
        { doerId: current.doerId, field, value: value instanceof Date ? value.toISOString() : value },
        { actorId: me.id },
      ),
    );
    if (revisedChange) {
      fieldEvents.push(
        taskFieldUpdated(
          taskId,
          { doerId: current.doerId, field: "revisedTargetDate", value: revisedChange.value.toISOString() },
          { actorId: me.id },
        ),
      );
    }
    await emitMany(db, fieldEvents);
  } catch (err) {
    console.warn("[updateTask] event emit failed (non-fatal):", (err as Error)?.message ?? err);
  }
  nudgeRelay();
  // Deferred (persist-then-return): push edits to the calendar event after the
  // response. Safe via retry state + the daily cron backstop.
  afterResponse(() => reconcileTaskEvent(taskId));
  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Approve or decline a task that the doer has marked done.
 * - Permission: initiator OR admin, status must be "done".
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: writes approved_by_id, approved_at, approval_note +
 *   a `status_changed` task_events row.
 *
 * Note: M2.2 deliberately does NOT permit edits to an approval after the
 * fact (per spec "Edit audit rows (any) — — (no one)").  If the
 * initiator changes their mind, they decline the existing decision and
 * the doer reworks, producing a second `status_changed` row.
 */
/* ------------------------------------------------------------------------- */
/* TWO-STAGE APPROVAL (mig 0185)                                             */
/* ------------------------------------------------------------------------- */

/**
 * The ONE choke point for both approval stages (Sir, 2026-08).
 *
 * The client sends only an INTENT - which level it is acting at and whether it
 * is approving or sending back - plus the optimistic-lock token. Everything that
 * decides whether that is allowed is re-derived HERE from the session actor and
 * the row as it exists in the database. A level, an id or a flag arriving from
 * the browser is never trusted.
 *
 * Both stages write status='approved' (or 'not_approved'), keeping the ~40
 * existing consumers of approved-ness correct; the STAGE is carried by
 * approval_level, and each stage stamps its own audit columns so a manager
 * sign-off is never overwritten by the admin one.
 */
export async function decideTaskApproval(
  taskId: string,
  input: { level: "manager" | "admin"; decision: "approved" | "send_back"; note?: string },
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "stale"; message?: string }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };
  if (input.level !== "manager" && input.level !== "admin") {
    return { ok: false, error: "invalid", message: "Bad level" };
  }
  if (input.decision !== "approved" && input.decision !== "send_back") {
    return { ok: false, error: "invalid", message: "Bad decision" };
  }

  const me = await requireUser();

  const current = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!current) return { ok: false, error: "not-found" };

  // Context the predicates need, all read server-side.
  const doerRow = await db.query.employees.findFirst({
    where: eq(employees.id, current.doerId),
    columns: { managerId: true },
  });
  const assignerId = current.initiatorId ?? current.createdById ?? null;
  const assignerRow = assignerId
    ? await db.query.employees.findFirst({
        where: eq(employees.id, assignerId),
        columns: { id: true, isAdmin: true },
      })
    : undefined;
  // Does the assigner manage anyone? That is what makes them "a manager".
  const assignerIsManager = assignerRow
    ? (await db.query.employees.findFirst({
        where: eq(employees.managerId, assignerRow.id),
        columns: { id: true },
      })) != null
    : false;

  const actor = { id: me.id, email: me.email ?? null, isAdmin: me.isAdmin };
  const permTask = {
    status: current.status,
    approvalLevel: (current.approvalLevel ?? "none") as "none" | "manager" | "admin",
    doerId: current.doerId,
    assignerId,
  };
  // Downline, not just direct reports (Sir, 2026-08-21). Only computed when the
  // cheap direct check already failed, so the common case still costs nothing;
  // and only for a real doer, so a task with no doer cannot walk the tree.
  const isDirectManager = !!doerRow?.managerId && doerRow.managerId === me.id;
  const isDoersUpline =
    isDirectManager || !current.doerId
      ? false
      : (await getDownlineIds(me.id)).includes(current.doerId);

  const ctx = {
    isDoersManager: isDirectManager,
    isDoersUpline,
    assignerIsAdmin: !!assignerRow?.isAdmin,
    assignerIsManager,
  };

  const permitted =
    input.decision === "approved"
      ? input.level === "admin"
        ? canAdminApprove(actor, permTask)
        : canManagerApprove(actor, permTask, ctx)
      : input.level === "admin"
        ? canAdminSendBack(actor, permTask)
        : canManagerSendBack(actor, permTask, ctx);
  if (!permitted) return { ok: false, error: "forbidden" };

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const note = input.note?.trim() || null;
  const approving = input.decision === "approved";
  const nextLevel = approving ? input.level : "none";

  const stale = await db.transaction(async (tx) => {
    const u = await tx
      .update(tasks)
      .set({
        status: approving ? "approved" : "not_approved",
        // Written in LOCKSTEP with status - these two columns used to be able to
        // disagree because different code paths wrote one or the other.
        approvalStatus: approving ? "approved" : "not_approved",
        approvalLevel: nextLevel,
        ...(approving && input.level === "manager"
          ? { managerApprovedById: me.id, managerApprovedAt: now, managerApprovalNote: note }
          : {}),
        ...(approving && input.level === "admin"
          ? { adminApprovedById: me.id, adminApprovedAt: now, adminApprovalNote: note }
          : {}),
        // Sending back clears BOTH stamps: the task is unapproved again, and a
        // stale stamp would read as a sign-off that no longer stands.
        ...(approving
          ? {}
          : {
              managerApprovedById: null,
              managerApprovedAt: null,
              managerApprovalNote: null,
              adminApprovedById: null,
              adminApprovedAt: null,
              adminApprovalNote: null,
            }),
        approvedById: me.id,
        approvedAt: now,
        approvalNote: note,
        updatedAt: now,
      })
      // The level predicate in the WHERE closes the double-promotion race: two
      // approvers acting at once, the second finds the level already moved.
      .where(
        and(
          eq(tasks.id, taskId),
          optimisticLockMatches(expectedDate),
          eq(tasks.approvalLevel, permTask.approvalLevel),
        ),
      )
      .returning({ id: tasks.id });
    if (u.length === 0) return true;

    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "status_changed",
      fromValue: { status: current.status, approvalLevel: permTask.approvalLevel },
      toValue: { status: approving ? "approved" : "not_approved", approvalLevel: nextLevel },
      note,
    });
    await emit(
      tx,
      taskApprovalDecided(
        taskId,
        { doerId: current.doerId, decision: approving ? "approved" : "not_approved" },
        { actorId: me.id },
      ),
    );
    return false;
  });
  if (stale) return { ok: false, error: "stale" };
  nudgeRelay();

  const label = taskLabel({ subject: current.subject, title: current.title });
  if (current.doerId !== me.id) {
    afterResponse(async () => {
      await notify({
        userId: current.doerId,
        kind: approving ? "approved" : "declined",
        title: approving
          ? me.name + (input.level === "admin" ? " gave final approval on " : " approved ") + label
          : me.name + " sent " + label + " back",
        body: note,
        taskId,
        actorId: me.id,
      });
    });
  }
  return { ok: true };
}

export async function approveTask(
  taskId: string,
  input: ApproveInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed: ApproveParsed;
  try {
    parsed = ApproveSchema.parse(input) as ApproveParsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  const doerRow = await db.query.employees.findFirst({
    where: eq(employees.id, current.doerId),
    columns: { managerId: true },
  });
  const isDoersManager = !!doerRow?.managerId && doerRow.managerId === me.id;
  const permTask = {
    createdById: current.createdById,
    initiatorId: current.initiatorId,
    doerId: current.doerId,
    status: current.status,
  };
  const permitted =
    parsed.decision === "approved"
      ? canApprove({ employee: { id: me.id, isAdmin: me.isAdmin }, task: permTask, isDoersManager })
      : canDecline({ employee: { id: me.id, isAdmin: me.isAdmin }, task: permTask });
  if (!permitted) return { ok: false, error: "forbidden" };

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  // Atomic UPDATE + audit insert — see setTaskStatus for the
  // rationale. Notifications dispatched after the txn commits.
  const now = new Date();
  const stale = await db.transaction(async (tx) => {
    const u = await tx
      .update(tasks)
      .set({
        status: parsed.decision, // "approved" | "not_approved"
        approvedById: me.id,
        approvedAt: now,
        approvalNote: parsed.note?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
      .returning({ id: tasks.id });
    if (u.length === 0) return true;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "status_changed",
      fromValue: { status: current.status },
      toValue: { status: parsed.decision },
      note: parsed.note?.trim() || null,
    });
    // Phase B (Law 2): the approval verdict is a domain fact the projection
    // counts. Emit ApprovalDecided in the same txn as the row + audit.
    await emit(
      tx,
      taskApprovalDecided(
        taskId,
        { doerId: current.doerId, decision: parsed.decision },
        { actorId: me.id },
      ),
    );
    return false;
  });
  if (stale) return { ok: false, error: "stale" };
  nudgeRelay();

  // Fan-out: tell the doer the verdict.  Approve → "approved" kind,
  // decline → "declined" kind so the recipient's UI can colour each
  // distinctly and the email subject can differ.  Body is the note.
  // DEFERRED (persist-then-return): the verdict is committed; the doer's
  // notification fans out after the response so the approver isn't blocked on
  // up to 4 external channels. Notifications carry their own retry table + cron.
  const label = taskLabel({ subject: current.subject, title: current.title });
  if (current.doerId !== me.id) {
    afterResponse(async () => {
      if (parsed.decision === "approved") {
        await notify({
          userId: current.doerId,
          kind: "approved",
          title: `${me.name} approved '${label}'`,
          body: parsed.note?.trim() || null,
          taskId,
          actorId: me.id,
        });
      } else {
        await notify({
          userId: current.doerId,
          kind: "declined",
          title: `${me.name} declined '${label}'`,
          body: parsed.note?.trim() || null,
          taskId,
          actorId: me.id,
        });
      }
    });
  }

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Reassign the doer.  Optionally resets status to "Not Read" (dont_know).
 * - Permission: doer OR initiator OR admin, and the task must be in the
 *   pending lane (the existing canReassign predicate enforces this).
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: sets transferred_from_id to the previous doer; writes
 *   a `reassigned` task_events row carrying from + to doer ids.  If
 *   resetStatus is set and the task isn't already dont_know, also
 *   writes a `status_changed` row (since the matrix treats status
 *   changes and reassigns as distinct concerns).
 */
export async function reassignTask(
  taskId: string,
  input: ReassignInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();
  // The third doer path (the Reassign dialog). Same rule — otherwise the inline
  // cell is locked while a dialog two clicks away does the same write.
  if (!(await canChangeDoerFor(me))) {
    return { ok: false, error: "forbidden", message: DOER_DENIED };
  }

  let parsed;
  try {
    parsed = ReassignSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canReassign({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  if (parsed.newDoerId === current.doerId) {
    // No-op: assigning to the same doer.
    return { ok: true };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  // sir's changes #3 — a reassign resets the task to "Not Read" (dont_know),
  // not "Not Started", so the new doer has to actually open it first.
  const shouldReset =
    parsed.resetStatus === true && current.status !== "dont_know";

  // Atomic reassign — the UPDATE, the `reassigned` audit row, and the
  // optional `status_changed` audit row all commit together or roll
  // back together.
  const stale = await db.transaction(async (tx) => {
    const u = await tx
      .update(tasks)
      .set({
        doerId: parsed.newDoerId,
        transferredFromId: current.doerId,
        updatedAt: now,
        ...(shouldReset ? { status: "dont_know" as const } : {}),
      })
      .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
      .returning({ id: tasks.id });
    if (u.length === 0) return true;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "reassigned",
      fromValue: { doerId: current.doerId },
      toValue: { doerId: parsed.newDoerId, resetStatus: shouldReset },
    });
    await emit(
      tx,
      taskReassigned(
        taskId,
        { fromDoerId: current.doerId, toDoerId: parsed.newDoerId, resetStatus: shouldReset },
        { actorId: me.id },
      ),
    );
    if (shouldReset) {
      await tx.insert(taskEvents).values({
        taskId,
        actorId: me.id,
        eventType: "status_changed",
        fromValue: { status: current.status },
        toValue: { status: "dont_know" },
      });
      await emit(
        tx,
        taskStatusChanged(
          taskId,
          { doerId: parsed.newDoerId, fromStatus: current.status, toStatus: "dont_know" },
          { actorId: me.id },
        ),
      );
    }
    return false;
  });
  if (stale) return { ok: false, error: "stale" };
  nudgeRelay();

  // Fan-out: new doer gets "to you"; old doer gets "away from you";
  // initiator (if distinct from both) gets a generic reassigned note.
  // DEFERRED (persist-then-return): the reassign is committed; notifications +
  // calendar move run after the response so the actor isn't blocked on external
  // channels + a Google API call. All carry retry state + the daily cron.
  const label = taskLabel({ subject: current.subject, title: current.title });
  afterResponse(async () => {
    if (parsed.newDoerId !== me.id) {
      await notify({
        userId: parsed.newDoerId,
        kind: "reassigned",
        title: `${me.name} reassigned '${label}' to you`,
        taskId,
        actorId: me.id,
      });
    }
    if (current.doerId !== me.id && current.doerId !== parsed.newDoerId) {
      await notify({
        userId: current.doerId,
        kind: "reassigned",
        title: `${me.name} reassigned '${label}' away from you`,
        taskId,
        actorId: me.id,
      });
    }
    // Loop in the initiator so they know who owns the task now.
    const initiatorRecipients = dedupeRecipients(
      [current.initiatorId],
      me.id,
    ).filter((id) => id !== parsed.newDoerId && id !== current.doerId);
    for (const userId of initiatorRecipients) {
      await notify({
        userId,
        kind: "reassigned",
        title: `${me.name} reassigned '${label}'`,
        taskId,
        actorId: me.id,
      });
    }
    // Move the calendar event to the new doer's calendar.
    await reconcileTaskEvent(taskId);
  });
  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Append a comment to the task's audit timeline.
 * - Permission: any task participant (creator/initiator/doer) or admin.
 * - No status change; no optimistic-lock against tasks (comments don't
 *   mutate the task row).  Always writes one `commented` task_events row
 *   with the body in `to_value.body` (jsonb stays flexible — future
 *   commit may include mention metadata).
 */
export async function addComment(
  taskId: string,
  input: CommentInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };

  // Delegate to the shared core (same rules as the mobile comment API).
  const result = await addTaskComment(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
    input,
  );
  if (!result.ok) return result;

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * nudgeTask — on-demand "⚡ ping" to a task's doer.
 *
 * Gate (in nudgeTaskCore): admin OR the task's initiator OR the doer's
 * direct manager. Soft rate-limited via the shared per-actor write
 * limiter. On success a `"nudged"` in-app notification (+ web-push if the
 * doer is subscribed) is dispatched through the existing notify() path.
 *
 * LOAD-NEUTRAL: read-only on the task + one recipient dispatch; no task
 * mutation and nothing on the dashboard load path.
 */
export async function nudgeTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(taskId)) return { ok: false, error: "Bad task id." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  return nudgeTaskCore(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
  );
}

// ───────────────────────────── Tier-3 admin-only ─────────────────────────
//
// approval_status + revised_target_date are admin-only columns added in
// migration 0019. They sit alongside the existing status column rather
// than reusing it, so the doer's "status" lifecycle stays independent
// from the initiator/admin's verdict (approved | not_approved | …).

/**
 * Set or clear `approval_status` on a task. Admin-only.
 * Pass `approvalStatus: null` to clear a previous verdict.
 */
export async function setTaskApprovalStatus(
  taskId: string,
  input: SetApprovalStatusInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  if (!isUuid(taskId)) {
    return { ok: false, error: "invalid", message: "Bad task id" };
  }
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "forbidden" };

  let parsed;
  try {
    parsed = SetApprovalStatusSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error: "invalid",
      message: err instanceof Error ? err.message : "Invalid input",
    };
  }

  // Pre-flight no-op check outside the txn — cheap, lets us skip
  // touching the row lock when nothing's changing.
  const preview = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, approvalStatus: true },
  });
  if (!preview) return { ok: false, error: "not-found" };
  if (preview.approvalStatus === parsed.approvalStatus) {
    return { ok: true }; // no-op
  }

  // Atomic: serialise concurrent admin verdicts via SELECT FOR UPDATE
  // (no public expectedUpdatedAt parameter to lean on for optimistic
  // locking) and pair the UPDATE with its audit row.
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const locked = await tx
      .select({ approvalStatus: tasks.approvalStatus })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    const row = locked[0];
    if (!row) return { ok: false as const, error: "not-found" as const };
    if (row.approvalStatus === parsed.approvalStatus) {
      return { ok: true as const, noop: true as const };
    }
    await tx
      .update(tasks)
      .set({ approvalStatus: parsed.approvalStatus, updatedAt: now })
      .where(eq(tasks.id, taskId));
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "field_updated",
      fromValue: { field: "approvalStatus", value: row.approvalStatus },
      toValue: {
        field: "approvalStatus",
        value: parsed.approvalStatus,
        ...(parsed.note ? { note: parsed.note } : {}),
      },
    });
    return { ok: true as const, noop: false as const };
  });
  if (!result.ok) return result;

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Set or clear `revised_target_date` on a task. Admin-only.
 * The original `due_at` is never modified — admins set the revised
 * target alongside it so the original commitment stays auditable.
 */
export async function setTaskRevisedTargetDate(
  taskId: string,
  input: SetRevisedTargetDateInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  if (!isUuid(taskId)) {
    return { ok: false, error: "invalid", message: "Bad task id" };
  }
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "forbidden" };

  let parsed;
  try {
    parsed = SetRevisedTargetDateSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error: "invalid",
      message: err instanceof Error ? err.message : "Invalid input",
    };
  }

  const nextIso = parsed.revisedTargetDate?.toISOString() ?? null;

  // Pre-flight no-op check outside the txn.
  const preview = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, revisedTargetDate: true },
  });
  if (!preview) return { ok: false, error: "not-found" };
  if ((preview.revisedTargetDate?.toISOString() ?? null) === nextIso) {
    return { ok: true }; // no-op
  }

  // Atomic UPDATE + audit, with row-level lock so two admins can't
  // race on the same revised target.
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const locked = await tx
      .select({ revisedTargetDate: tasks.revisedTargetDate })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    const row = locked[0];
    if (!row) return { ok: false as const, error: "not-found" as const };
    const prevIso = row.revisedTargetDate?.toISOString() ?? null;
    if (prevIso === nextIso) {
      return { ok: true as const, noop: true as const };
    }
    await tx
      .update(tasks)
      .set({ revisedTargetDate: parsed.revisedTargetDate, updatedAt: now })
      .where(eq(tasks.id, taskId));
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "field_updated",
      fromValue: { field: "revisedTargetDate", value: prevIso },
      toValue: { field: "revisedTargetDate", value: nextIso },
    });
    return { ok: true as const, noop: false as const };
  });
  if (!result.ok) return result;

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

// ───────────────────────────── Phase 3.2 — comment edit/delete ─────────────
//
// Authors can edit/delete their own comments within 15 minutes of posting;
// admins can edit/delete any. Beyond the 15-minute window non-admins are
// frozen out — the audit trail is supposed to be ~immutable, the grace
// window is just for typo fixes / accidental sends.
//
// Edit updates the `task_events.to_value` JSONB in place, adding an
// `editedAt` stamp so the UI can render "(edited)". Delete hard-removes
// the row (the FK in notifications is `set null`, so push-rows that
// referenced it just lose the link rather than cascading).

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

function canMutateComment(
  event: { actorId: string; eventType: string; createdAt: Date },
  me: { id: string; isAdmin: boolean },
): { ok: true } | { ok: false; error: string } {
  if (event.eventType !== "commented") {
    return { ok: false, error: "Not a comment event" };
  }
  if (me.isAdmin) return { ok: true };
  if (event.actorId !== me.id) return { ok: false, error: "Forbidden" };
  if (Date.now() - event.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) {
    return { ok: false, error: "Edit window expired (15 minutes)" };
  }
  return { ok: true };
}

export async function editComment(
  eventId: string,
  input: { body: string },
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "expired"; message?: string }
> {
  if (!isUuid(eventId)) return { ok: false, error: "invalid", message: "Bad event id" };
  const parsed = CommentSchema.safeParse({ body: input.body });
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const me = await requireUser();
  const event = await db.query.taskEvents.findFirst({
    where: eq(taskEvents.id, eventId),
  });
  if (!event) return { ok: false, error: "not-found" };

  const gate = canMutateComment(event, { id: me.id, isAdmin: me.isAdmin });
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.error.startsWith("Edit window") ? "expired" : "forbidden",
      message: gate.error,
    };
  }

  // Belt-and-braces: scope the WHERE to the same gate so a concurrent
  // ownership change between auth check and write can't bypass it.
  await db
    .update(taskEvents)
    .set({
      toValue: { body: parsed.data.body, editedAt: new Date().toISOString() },
    })
    .where(
      me.isAdmin
        ? eq(taskEvents.id, eventId)
        : and(eq(taskEvents.id, eventId), eq(taskEvents.actorId, me.id)),
    );

  revalidatePath(`/tasks/${event.taskId}`);
  return { ok: true };
}

export async function deleteComment(
  eventId: string,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "expired"; message?: string }
> {
  if (!isUuid(eventId)) return { ok: false, error: "invalid", message: "Bad event id" };

  const me = await requireUser();
  const event = await db.query.taskEvents.findFirst({
    where: eq(taskEvents.id, eventId),
  });
  if (!event) return { ok: false, error: "not-found" };

  const gate = canMutateComment(event, { id: me.id, isAdmin: me.isAdmin });
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.error.startsWith("Edit window") ? "expired" : "forbidden",
      message: gate.error,
    };
  }

  await db
    .delete(taskEvents)
    .where(
      me.isAdmin
        ? eq(taskEvents.id, eventId)
        : and(eq(taskEvents.id, eventId), eq(taskEvents.actorId, me.id)),
    );

  revalidatePath(`/tasks/${event.taskId}`);
  return { ok: true };
}

/**
 * Options for the header "New Task" modal — employees + client/subject/project
 * rosters. Loaded LAZILY (once, on first dialog open) instead of eagerly in the
 * header Server Component on every render. This decouples the modal's data from
 * the global `router.refresh()` cycle (the realtime LiveIndicator fires it on
 * every org-wide task change), which was re-running these 4 queries constantly
 * and handing the open modal fresh array identities that re-synced its
 * dropdowns mid-edit — the root cause of the "New Task modal" instability.
 */
export async function loadNewTaskOptions(): Promise<{
  employees: { id: string; name: string }[];
  clients: string[];
  subjects: string[];
  projectNodes: { id: string; label: string }[];
  /** May this user create a new client/subject from the pickers?
   *  Admins and super-admins only — see `canAddTaskRoster`. */
  canAddRoster: boolean;
}> {
  const me = await requireUser();
  const [all, clientNames, subjectNames, projectNodes] = await Promise.all([
    listEmployees(),
    listActiveClientNames(),
    listActiveSubjectNames(),
    listProjectNodeOptions(),
  ]);
  return {
    employees: all.map((e) => ({ id: e.id, name: e.name })),
    clients: clientNames,
    subjects: subjectNames,
    projectNodes,
    canAddRoster: canAddTaskRoster(me),
  };
}
