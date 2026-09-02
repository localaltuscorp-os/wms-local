import { format, isToday, isYesterday } from "date-fns";
import { TASK_EVENT_TYPES, type TaskEventType } from "@/lib/events";
import type { TaskStatus } from "@/db/enums";

/**
 * Source of an activity event.  `task` events come from `task_events`,
 * `employee` events from `employee_events` (admin CRUD on the org's
 * directory), and `settings` events from `settings_events` (admin tweaks
 * to org_settings, status_settings, departments, etc.).
 */
export type ActivitySource = "task" | "employee" | "settings";

/**
 * A single row in the global admin activity feed.  Re-declared here (instead
 * of imported from `lib/queries/activity.ts`) so the transform module stays
 * decoupled from the "server-only" query module — vitest can import these
 * helpers without dragging in a postgres connection.
 */
export type ActivityRow = {
  id: string;
  source: ActivitySource;
  // Task-source fields
  taskId: string | null;
  taskSubject: string | null;
  taskTitle: string;
  taskStatus: TaskStatus;
  // Employee-source fields
  targetEmployeeId: string | null;
  targetEmployeeName: string | null;
  // Settings-source fields
  settingScope: string | null;
  settingTargetId: string | null;
  // Common
  actorId: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  eventType: TaskEventType | string;
  fromValue: unknown;
  toValue: unknown;
  note: string | null;
  createdAt: Date;
};

export interface ActivityFilters {
  before: Date | null;
  actorIds: string[];
  kinds: TaskEventType[];
  source: ActivitySource[];
  from: Date | null;
  to: Date | null;
}

const TASK_EVENT_TYPE_SET = new Set<TaskEventType>(TASK_EVENT_TYPES);

/**
 * Pure transform: read the activity-feed URL search params into typed
 * filters.  Skips invalid event types / dates silently instead of throwing.
 */
export function parseActivityFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ActivityFilters {
  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const split = (v: string | undefined): string[] =>
    typeof v === "string"
      ? v.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const actorIds = split(get("actor"));

  const kinds = split(get("kind")).filter((k): k is TaskEventType =>
    TASK_EVENT_TYPE_SET.has(k as TaskEventType),
  );

  const source = split(get("src")).filter(
    (s): s is ActivitySource => s === "task" || s === "employee" || s === "settings",
  );

  const parseDate = (v: string | undefined): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  return {
    before: parseDate(get("before")),
    actorIds,
    kinds,
    source,
    from: parseDate(get("from")),
    to: parseDate(get("to")),
  };
}

export type DayGroup = {
  key: string;
  label: string;
  events: ActivityRow[];
};

/**
 * Splits a newest-first event list into per-day buckets, preserving the
 * incoming order within each bucket.  Bucket label is "Today" / "Yesterday"
 * / "May 12, 2026".  Pure transform — no `now` dependency beyond date-fns'
 * built-in today/yesterday helpers.
 */
export function groupByDay(events: ActivityRow[]): DayGroup[] {
  const out: DayGroup[] = [];
  const seen = new Map<string, DayGroup>();

  for (const ev of events) {
    const key = format(ev.createdAt, "yyyy-MM-dd");
    let group = seen.get(key);
    if (!group) {
      group = { key, label: dayLabel(ev.createdAt), events: [] };
      seen.set(key, group);
      out.push(group);
    }
    group.events.push(ev);
  }

  return out;
}

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

/**
 * Per-source copy generator for employee_events.  Produces the trailing
 * verb-phrase ("invited Jane Doe", "deactivated Sam") to render after the
 * actor name in the activity list.  Falls back to a humanised event-type
 * string for unknown event types so new events render gracefully instead of
 * disappearing.
 *
 * Real event_type strings emitted in
 * `app/(admin)/admin/employees/actions.ts`:
 *   "invited", "edited", "invite_resent", "deactivated", "reactivated".
 */
export function employeeEventCopy(row: ActivityRow): string {
  const target = row.targetEmployeeName ?? "an employee";
  switch (row.eventType) {
    case "invited":
      return `invited ${target}`;
    case "invite_resent":
      return `re-sent invite to ${target}`;
    case "edited":
      return `edited ${target}'s profile`;
    case "deactivated":
      return `deactivated ${target}`;
    case "reactivated":
      return `reactivated ${target}`;
    default:
      return `${row.eventType.replace(/_/g, " ")} (${target})`;
  }
}

/**
 * Per-source copy generator for settings_events.  Dispatches on the
 * (scope, event_type) pair since "updated" / "created" are overloaded
 * across scopes — only the tuple disambiguates.
 *
 * Real (scope, event_type) tuples emitted today:
 *   - ("org_settings",    "updated") — general settings save OR notification
 *                                       matrix save (disambiguated by peeking
 *                                       at toValue for a `notificationMatrix`
 *                                       key, since both share the same scope).
 *   - ("status_settings", "updated")
 *   - ("department",      "created")
 *   - ("department",      "updated")
 */
export function settingsEventCopy(row: ActivityRow): string {
  const scope = row.settingScope ?? "";
  const evt = row.eventType;

  if (scope === "org_settings" && evt === "updated") {
    // Notification-matrix saves and general-settings saves both land on
    // ("org_settings", "updated"); peek at toValue to tell them apart.
    if (
      row.toValue &&
      typeof row.toValue === "object" &&
      "notificationMatrix" in (row.toValue as Record<string, unknown>)
    ) {
      return "updated notification routing";
    }
    return "updated organisation settings";
  }
  if (scope === "status_settings" && evt === "updated") return "updated status settings";
  if (scope === "notification_matrix" && evt === "updated") return "updated notification routing";
  if (scope === "department" && evt === "created") return "created a department";
  if (scope === "department" && evt === "updated") return "updated a department";
  if (scope === "department" && evt === "deleted") return "deleted a department";

  // Fallback: humanise both fields so admin can still parse it.
  const niceScope = scope.replace(/_/g, " ");
  const niceEvt = evt.replace(/_/g, " ");
  return niceScope ? `${niceEvt} (${niceScope})` : niceEvt;
}
