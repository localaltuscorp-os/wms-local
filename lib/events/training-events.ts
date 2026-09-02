/**
 * PMS — training event builders (mig 0095). aggregateType "training";
 * aggregateId is the testId / materialId. Payloads carry the denormalised
 * employeeId + score/passed the employee_twin projection needs.
 */
import {
  TRAINING_AGGREGATE,
  TrainingEventTypes,
  type EventEnvelope,
  type TrainingTestAttemptedV1,
  type TrainingMaterialWatchedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(aggId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: TRAINING_AGGREGATE,
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

export const trainingTestAttempted = (testId: string, p: TrainingTestAttemptedV1, meta: Meta) =>
  base(testId, TrainingEventTypes.TestAttempted, p as unknown as Record<string, unknown>, meta);

export const trainingMaterialWatched = (materialId: string, p: TrainingMaterialWatchedV1, meta: Meta) =>
  base(materialId, TrainingEventTypes.MaterialWatched, p as unknown as Record<string, unknown>, meta);
