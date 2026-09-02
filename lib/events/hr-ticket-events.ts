/**
 * HR Support / Ticketing (mig 0145) — event builders. aggregateType
 * "hr_ticket"; aggregateId = hr_tickets.id. The event log IS the ticket audit
 * trail (design brief: "Audit = event_log, not a bespoke table"). Mirrors the
 * goal-events.ts builder pattern.
 *
 * CONFIDENTIALITY: never put the subject line (or message bodies) of a
 * confidential ticket into a payload — ids + category + flags only. The shared
 * HrTicketEventV1 shape has no subject field on purpose.
 */
import {
  HR_TICKET_AGGREGATE,
  HrTicketEventTypes,
  type EventEnvelope,
  type HrTicketEventType,
  type HrTicketEventV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

/** Generic builder — pick the event type + flat payload. */
export function hrTicketEvent(
  ticketId: string,
  eventType: HrTicketEventType,
  payload: HrTicketEventV1,
  meta: Meta,
): EventEnvelope {
  return {
    aggregateType: HR_TICKET_AGGREGATE,
    aggregateId: ticketId,
    eventType,
    eventVersion: 1,
    payload: payload as unknown as Record<string, unknown>,
    actorId: meta.actorId,
    correlationId: meta.correlationId ?? null,
    orgId: meta.orgId ?? null,
    ...(meta.occurredAt ? { occurredAt: meta.occurredAt } : {}),
  };
}

// Convenience wrappers for the common lifecycle moments.
export const hrTicketCreated = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Created, p, m);
export const hrTicketAssigned = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Assigned, p, m);
export const hrTicketStatusChanged = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.StatusChanged, p, m);
export const hrTicketReplied = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Replied, p, m);
export const hrTicketNoteAdded = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.NoteAdded, p, m);
export const hrTicketResolved = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Resolved, p, m);
export const hrTicketClosed = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Closed, p, m);
export const hrTicketReopened = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.Reopened, p, m);
export const hrTicketSlaBreached = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.SlaBreached, p, m);
export const hrTicketCsatSubmitted = (id: string, p: HrTicketEventV1, m: Meta) =>
  hrTicketEvent(id, HrTicketEventTypes.CsatSubmitted, p, m);
