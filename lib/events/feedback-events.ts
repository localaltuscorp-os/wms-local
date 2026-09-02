/**
 * PMS — feedback event builders (mig 0095). aggregateType "feedback";
 * aggregateId is the feedbackId. The rated employee may be unknown (free-text
 * feedback), so payloads carry employeeId as nullable; the projection skips
 * null-employee events.
 */
import {
  FEEDBACK_AGGREGATE,
  FeedbackEventTypes,
  type EventEnvelope,
  type FeedbackReceivedV1,
  type FeedbackResolvedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(aggId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: FEEDBACK_AGGREGATE,
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

export const feedbackReceived = (feedbackId: string, p: FeedbackReceivedV1, meta: Meta) =>
  base(feedbackId, FeedbackEventTypes.Received, p as unknown as Record<string, unknown>, meta);

export const feedbackResolved = (feedbackId: string, p: FeedbackResolvedV1, meta: Meta) =>
  base(feedbackId, FeedbackEventTypes.Resolved, p as unknown as Record<string, unknown>, meta);
