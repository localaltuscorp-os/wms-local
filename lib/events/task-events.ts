/**
 * Phase B — task event builders. Thin constructors that produce the typed
 * envelopes the task engine emits, so every mutation site stays a one-liner and
 * payload shapes never drift. aggregateType is always "task" (Law 3:
 * domain-owned).
 */
import {
  TASK_AGGREGATE,
  TaskEventTypes,
  type EventEnvelope,
  type TaskCreatedV1,
  type TaskStatusChangedV1,
  type TaskReassignedV1,
  type TaskArchivedV1,
  type TaskRestoredV1,
  type TaskFieldUpdatedV1,
  type TaskApprovalDecidedV1,
  type TaskDeletedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(taskId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: TASK_AGGREGATE,
    aggregateId: taskId,
    eventType,
    eventVersion: 1,
    payload,
    actorId: meta.actorId,
    correlationId: meta.correlationId ?? null,
    orgId: meta.orgId ?? null,
    ...(meta.occurredAt ? { occurredAt: meta.occurredAt } : {}),
  };
}

export const taskCreated = (taskId: string, p: TaskCreatedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.Created, p as unknown as Record<string, unknown>, meta);

export const taskStatusChanged = (taskId: string, p: TaskStatusChangedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.StatusChanged, p as unknown as Record<string, unknown>, meta);

export const taskReassigned = (taskId: string, p: TaskReassignedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.Reassigned, p as unknown as Record<string, unknown>, meta);

export const taskArchived = (taskId: string, p: TaskArchivedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.Archived, p as unknown as Record<string, unknown>, meta);

export const taskRestored = (taskId: string, p: TaskRestoredV1, meta: Meta) =>
  base(taskId, TaskEventTypes.Restored, p as unknown as Record<string, unknown>, meta);

export const taskFieldUpdated = (taskId: string, p: TaskFieldUpdatedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.FieldUpdated, p as unknown as Record<string, unknown>, meta);

export const taskApprovalDecided = (taskId: string, p: TaskApprovalDecidedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.ApprovalDecided, p as unknown as Record<string, unknown>, meta);

export const taskDeleted = (taskId: string, p: TaskDeletedV1, meta: Meta) =>
  base(taskId, TaskEventTypes.Deleted, p as unknown as Record<string, unknown>, meta);
