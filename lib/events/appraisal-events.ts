/**
 * Appraisal (mig 0146) — event builders. aggregateType "appraisal";
 * aggregateId = appraisal_cycles.id (cycle-level) or appraisal_items.id
 * (item/score-level). Feed/audit only — no projection consumes these yet (the
 * employee_twin rules default-ignore unknown event types). Mirrors the
 * goal-events.ts builder pattern.
 */
import {
  APPRAISAL_AGGREGATE,
  AppraisalEventTypes,
  type AppraisalEventType,
  type AppraisalEventV1,
  type EventEnvelope,
} from "./types";

/**
 * event_log.aggregate_id is a `uuid NOT NULL` column, so singleton / period-keyed
 * appraisal events (config + culture rotation) — which have no single UUID entity
 * to point at — use these stable sentinel UUIDs. The distinguishing detail (the
 * period, etc.) rides in the payload; these events are audit-only.
 */
export const APPRAISAL_CONFIG_AGGREGATE_ID = "a9911111-1111-4111-8111-111111111111";
export const APPRAISAL_CULTURE_AGGREGATE_ID = "a9922222-2222-4222-8222-222222222222";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

/** Generic builder — pick the event type + flat payload. */
export function appraisalEvent(
  aggregateId: string,
  eventType: AppraisalEventType,
  payload: AppraisalEventV1,
  meta: Meta,
): EventEnvelope {
  return {
    aggregateType: APPRAISAL_AGGREGATE,
    aggregateId,
    eventType,
    eventVersion: 1,
    payload: payload as unknown as Record<string, unknown>,
    actorId: meta.actorId,
    correlationId: meta.correlationId ?? null,
    orgId: meta.orgId ?? null,
    ...(meta.occurredAt ? { occurredAt: meta.occurredAt } : {}),
  };
}

// Convenience wrappers.
export const appraisalCycleOpened = (cycleId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(cycleId, AppraisalEventTypes.CycleOpened, p, m);
export const appraisalCycleFinalized = (cycleId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(cycleId, AppraisalEventTypes.CycleFinalized, p, m);
export const appraisalConfigUpdated = (p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(APPRAISAL_CONFIG_AGGREGATE_ID, AppraisalEventTypes.ConfigUpdated, p, m);
export const appraisalItemPublished = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.ItemPublished, p, m);
export const appraisalKpiApproved = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.KpiApproved, p, m);
export const appraisalSelfSubmitted = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.SelfSubmitted, p, m);
export const appraisalManagerSubmitted = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.ManagerSubmitted, p, m);
export const appraisalManagementSubmitted = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.ManagementSubmitted, p, m);
export const appraisalItemFinalized = (itemId: string, p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(itemId, AppraisalEventTypes.ItemFinalized, p, m);
export const appraisalCultureAssigned = (p: AppraisalEventV1, m: Meta) =>
  appraisalEvent(APPRAISAL_CULTURE_AGGREGATE_ID, AppraisalEventTypes.CultureAssigned, p, m);
