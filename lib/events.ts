/**
 * Event vocabulary for the M2 audit trail.
 *
 * Adding a new event type = add it here AND write rows to the
 * task_events table.  Anything not in the union is a compile-time
 * error at the call site.
 *
 * M2.1 implements only the two event types it needs (`created`,
 * `field_updated`).  The remaining types from the spec (status_changed,
 * reassigned, transferred_external, priority_changed, due_changed,
 * archived, restored, commented) are reserved here so the union is
 * forward-compatible — M2.2 / M2.3 will wire their Server Actions
 * to emit those values without changing this file.
 */

export const TASK_EVENT_TYPES = [
  // M2.1:
  "created",
  "field_updated",
  // Reserved (M2.2+ — Server Actions to be added in later plans):
  "status_changed",
  "reassigned",
  "transferred_external",
  "priority_changed",
  "due_changed",
  "archived",
  "restored",
  "commented",
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

/**
 * Field names tracked by the `field_updated` event.  Kept narrow to the
 * editable subset (see EditTaskFieldsSchema in lib/validators/task.ts).
 */
export const EDITABLE_TASK_FIELDS = [
  "title",
  "description",
  "subject",
  "priority",
  "dueAt",
  "notes",
  "tags", // Tier-3 — tracked in field_updated events the same way as the others.
  // Tier-4 — GCal-style scheduling fields.
  "startsAt",
  "endsAt",
  "allDay",
  "recurrence",
  "recurrenceRule",
  "projectNodeId",
] as const;

export type EditableTaskField = (typeof EDITABLE_TASK_FIELDS)[number];
