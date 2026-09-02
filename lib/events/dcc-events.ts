/**
 * PMS — DCC (daily compliance) event builders (mig 0095). aggregateType "dcc".
 * EntryFilled is keyed by the KPI itemId; Reviewed is keyed by the employeeId
 * (the review is about the person's day). Payloads carry the denormalised
 * employeeId + target so the projection never reads the operational row.
 */
import {
  DCC_AGGREGATE,
  DccEventTypes,
  type EventEnvelope,
  type DccEntryFilledV1,
  type DccReviewedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(aggId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: DCC_AGGREGATE,
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

export const dccEntryFilled = (itemId: string, p: DccEntryFilledV1, meta: Meta) =>
  base(itemId, DccEventTypes.EntryFilled, p as unknown as Record<string, unknown>, meta);

export const dccReviewed = (employeeId: string, p: DccReviewedV1, meta: Meta) =>
  base(employeeId, DccEventTypes.Reviewed, p as unknown as Record<string, unknown>, meta);
