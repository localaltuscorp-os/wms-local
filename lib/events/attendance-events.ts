/**
 * PMS — attendance event builders (mig 0095). Thin constructors for the
 * employee-domain attendance events the punch path emits. aggregateType is
 * always "attendance"; aggregateId is the employeeId (Law 3: domain-owned).
 * Payloads are flat + denormalised so the employee_twin projection never reads
 * the operational attendance row.
 */
import {
  ATTENDANCE_AGGREGATE,
  AttendanceEventTypes,
  type EventEnvelope,
  type AttendancePunchedV1,
} from "./types";

interface Meta {
  actorId: string;
  correlationId?: string | null;
  orgId?: string | null;
  occurredAt?: Date;
}

function base(aggId: string, eventType: string, payload: Record<string, unknown>, meta: Meta): EventEnvelope {
  return {
    aggregateType: ATTENDANCE_AGGREGATE,
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

export const attendancePunched = (employeeId: string, p: AttendancePunchedV1, meta: Meta) =>
  base(employeeId, AttendanceEventTypes.Punched, p as unknown as Record<string, unknown>, meta);
