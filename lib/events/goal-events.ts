/**
 * PMS — goal event builders (mig 0095). aggregateType "goal"; aggregateId is the
 * goalId. Payloads carry the denormalised employeeId + weight + weekStart the
 * employee_twin projection needs (weight-aware goal scoring).
 */
import {
  GOAL_AGGREGATE,
  GoalEventTypes,
  type EventEnvelope,
  type GoalProgressLoggedV1,
  type GoalReviewedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(aggId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: GOAL_AGGREGATE,
    aggregateId: aggId,
    eventType,
    eventVersion: 1,
    payload,
    actorId: meta.actorId,
    correlationId: meta.correlationId ?? null,
    orgId: meta.orgId ?? null,
    ...(meta.occurredAt ? { occurredAt: meta.occurredAt } : {}),
  };
}

export const goalProgressLogged = (goalId: string, p: GoalProgressLoggedV1, meta: Meta) =>
  base(goalId, GoalEventTypes.ProgressLogged, p as unknown as Record<string, unknown>, meta);

export const goalReviewed = (goalId: string, p: GoalReviewedV1, meta: Meta) =>
  base(goalId, GoalEventTypes.Reviewed, p as unknown as Record<string, unknown>, meta);
