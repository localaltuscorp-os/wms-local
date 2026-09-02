/**
 * Phase B — PURE command derivation (no db import, so it's unit-testable). Maps
 * an event to the external commands it should cause, with a DETERMINISTIC
 * dedupe_key per command so replaying the same event collides on the unique key
 * and fires nothing twice (Law 8).
 */
import {
  TASK_AGGREGATE,
  TaskEventTypes,
  type StoredEvent,
  type TaskReassignedV1,
} from "@/lib/events/types";

export interface DerivedCommand {
  commandType: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}

export function deriveCommands(event: StoredEvent): DerivedCommand[] {
  if (event.aggregateType !== TASK_AGGREGATE) return [];
  switch (event.eventType) {
    case TaskEventTypes.Reassigned: {
      const p = event.payload as unknown as TaskReassignedV1;
      if (!p.toDoerId) return [];
      return [
        {
          commandType: "notify",
          dedupeKey: `${event.eventId}:notify:${p.toDoerId}`,
          payload: {
            userId: p.toDoerId,
            kind: "reassigned",
            taskId: event.aggregateId,
            actorId: event.actorId,
          },
        },
      ];
    }
    default:
      return [];
  }
}
