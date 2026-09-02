/**
 * Phase B — the PURE task-metrics projection rule. Deliberately imports nothing
 * but event types (no db), so it's unit-testable in isolation and the handler in
 * task-metrics.ts is a thin wrapper that just applies the delta.
 */
import {
  TASK_AGGREGATE,
  TaskEventTypes,
  type StoredEvent,
  type TaskCreatedV1,
  type TaskStatusChangedV1,
  type TaskApprovalDecidedV1,
} from "@/lib/events/types";

export type CountColumn =
  | "createdCount"
  | "doneCount"
  | "approvedCount"
  | "notApprovedCount";

export interface MetricDelta {
  day: string;
  doerId: string;
  column: CountColumn;
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Which counter, if any, a task event bumps. Returns null for events that
 *  don't affect the rollup (or carry no doer). */
export function taskMetricDelta(event: StoredEvent): MetricDelta | null {
  if (event.aggregateType !== TASK_AGGREGATE) return null;
  const day = dayOf(event.occurredAt);
  switch (event.eventType) {
    case TaskEventTypes.Created: {
      const p = event.payload as unknown as TaskCreatedV1;
      return p.doerId ? { day, doerId: p.doerId, column: "createdCount" } : null;
    }
    case TaskEventTypes.StatusChanged: {
      const p = event.payload as unknown as TaskStatusChangedV1;
      if (!p.doerId) return null;
      if (p.toStatus === "done") return { day, doerId: p.doerId, column: "doneCount" };
      if (p.toStatus === "approved") return { day, doerId: p.doerId, column: "approvedCount" };
      if (p.toStatus === "not_approved") return { day, doerId: p.doerId, column: "notApprovedCount" };
      return null;
    }
    case TaskEventTypes.ApprovalDecided: {
      const p = event.payload as unknown as TaskApprovalDecidedV1;
      if (!p.doerId) return null;
      return {
        day,
        doerId: p.doerId,
        column: p.decision === "approved" ? "approvedCount" : "notApprovedCount",
      };
    }
    default:
      return null;
  }
}
