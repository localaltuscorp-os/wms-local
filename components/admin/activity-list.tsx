import Link from "next/link";
import type { Route } from "next";
import { format, formatDistanceToNow } from "date-fns";
import { FileText, UserPlus, Settings as SettingsIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AuditEvent } from "@/components/tasks/audit-event";
import { dotColorFor } from "@/components/tasks/audit-event-meta";
import type { ActivityRow, ActivitySource } from "@/lib/transforms/activity";
import {
  employeeEventCopy,
  groupByDay,
  settingsEventCopy,
} from "@/lib/transforms/activity";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { TaskStatus } from "@/db/enums";

type IconComponent = ComponentType<{
  size?: number;
  "aria-hidden"?: boolean;
  strokeWidth?: number;
}>;

const SOURCE_ICONS: Record<ActivitySource, IconComponent> = {
  task: FileText,
  employee: UserPlus,
  settings: SettingsIcon,
};

const SOURCE_TINTS: Record<ActivitySource, string> = {
  task: "var(--color-blue)",
  employee: "var(--color-purple)",
  settings: "var(--color-amber)",
};

const SOURCE_LABELS: Record<ActivitySource, string> = {
  task: "Task",
  employee: "Employee",
  settings: "Settings",
};


interface Props {
  events: ActivityRow[];
  hasMore: boolean;
  /** Pre-computed URL to load older events (?before=<isoOldest>). */
  loadOlderHref: string | null;
  statusLabels?: Record<TaskStatus, string>;
}

/**
 * Renders the org-wide activity stream, grouped by date.  Uses
 * {@link AuditEvent} (content-only) for the body, surrounded by an actor
 * avatar + linked task subject + timestamp.
 */
export function ActivityList({ events, hasMore, loadOlderHref, statusLabels }: Props) {
  if (events.length === 0) {
    return (
      <div
        className="text-center py-16 rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p className="text-[15px] text-ink-subtle italic">No activity yet.</p>
      </div>
    );
  }

  const groups = groupByDay(events);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h2
            className="text-table-head sticky -mx-1 px-1 py-2 z-10 max-md:!top-32"
            style={{
              top: 88,
              backgroundColor: "rgba(250, 251, 252, 0.85)",
              backdropFilter: "blur(12px) saturate(150%)",
              WebkitBackdropFilter: "blur(12px) saturate(150%)",
            }}
          >
            {group.label}
            <span
              className="ml-2 tabular-nums"
              style={{ fontWeight: 500, opacity: 0.7 }}
            >
              {group.events.length}
            </span>
          </h2>
          <ul
            className="rounded-section bg-surface-card border border-hairline overflow-hidden divide-y"
            style={{
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
              borderColor: "transparent",
            }}
          >
            {group.events.map((ev) => (
              <ActivityListItem key={ev.id} row={ev} statusLabels={statusLabels} />
            ))}
          </ul>
        </section>
      ))}

      {hasMore && loadOlderHref && (
        <div className="flex justify-center pt-2 pb-12">
          <Link
            href={loadOlderHref as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-chip bg-surface-card border border-hairline-strong text-chip text-ink-strong hover:border-ink-subtle transition-colors"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            Load older
            <span aria-hidden>↓</span>
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * One row in the activity list.  Dispatches on `row.source` so the existing
 * task renderer (AuditEvent) is unchanged while employee/settings sources
 * get bespoke inline copy.  The left rail carries the actor avatar +
 * source-kind chip; the right rail is the relative timestamp.
 */
function ActivityListItem({
  row,
  statusLabels,
}: {
  row: ActivityRow;
  statusLabels?: Record<TaskStatus, string>;
}) {
  const relative = formatDistanceToNow(row.createdAt, { addSuffix: true });
  const exact = format(row.createdAt, "MMM d, h:mm a");

  return (
    <li
      className="flex items-start gap-3 px-5 py-4 border-t border-hairline first:border-t-0 hover:bg-[rgba(15,23,42,0.015)] transition-colors"
    >
      <ActorBlock row={row} />

      <div className="flex-1 min-w-0">
        {row.source === "task" ? (
          <TaskRowBody row={row} statusLabels={statusLabels} />
        ) : row.source === "employee" ? (
          <EmployeeRowBody row={row} />
        ) : (
          <SettingsRowBody row={row} />
        )}
      </div>

      <div
        className="shrink-0 text-right text-[13px] text-ink-subtle tabular-nums"
        title={exact}
      >
        {relative}
      </div>
    </li>
  );
}

/**
 * Shared left-rail block: actor avatar with the source-kind chip stacked
 * underneath as an overlay-dot.  Keeps every source visually aligned at the
 * same x-axis as the task rows the page started with.
 */
function ActorBlock({ row }: { row: ActivityRow }) {
  // For task rows we keep the existing event-coloured status dot so the
  // page still reads "what kind of action".  For employee/settings rows we
  // swap in a small source-kind chip instead.
  if (row.source === "task") {
    const dot = dotColorFor(row.eventType as import("@/lib/events").TaskEventType);
    return (
      <div className="relative shrink-0">
        <Avatar name={row.actorName ?? "?"} avatarUrl={row.actorAvatarUrl} size={36} />
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 rounded-full"
          style={{
            width: 10,
            height: 10,
            background: dot,
            boxShadow: "0 0 0 2px var(--color-surface-card)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <Avatar name={row.actorName ?? "?"} avatarUrl={row.actorAvatarUrl} size={36} />
      <span
        aria-hidden
        className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full"
        style={{
          width: 18,
          height: 18,
          background: "var(--color-surface-card)",
          boxShadow: "0 0 0 1.5px var(--color-surface-card)",
          color: SOURCE_TINTS[row.source],
        }}
      >
        {(() => {
          const Icon = SOURCE_ICONS[row.source];
          return <Icon size={11} strokeWidth={2.4} aria-hidden />;
        })()}
      </span>
    </div>
  );
}

function TaskRowBody({
  row,
  statusLabels,
}: {
  row: ActivityRow;
  statusLabels?: Record<TaskStatus, string>;
}) {
  const auditRow: AuditFeedRow = {
    id: row.id,
    taskId: row.taskId ?? "",
    actorId: row.actorId,
    actorName: row.actorName,
    eventType: row.eventType as import("@/lib/events").TaskEventType,
    fromValue: row.fromValue,
    toValue: row.toValue,
    note: row.note,
    createdAt: row.createdAt,
  };

  const subject = row.taskSubject?.trim() || row.taskTitle;

  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-ink-strong text-[15px]">
          {row.actorName ?? "Someone"}
        </span>
        <span className="text-ink-subtle">·</span>
        <Link
          href={`/tasks/${row.taskId}` as Route}
          className="text-[15px] text-ink-soft hover:text-altus-red transition-colors max-w-[40ch] truncate"
          style={{ color: "var(--color-ink-soft)" }}
          title={subject}
        >
          {subject}
        </Link>
      </div>
      <div className="mt-1">
        {/* Body-only audit-event renderer.  We omit the actor strong-name
           from its prefix by rendering through AuditEvent, which already
           starts with "<strong>Who</strong> …" — the duplicate is
           intentional and matches the per-task feed pattern. */}
        <div className="audit-inline">
          <AuditEvent row={auditRow} statusLabels={statusLabels} />
        </div>
      </div>
    </>
  );
}

function EmployeeRowBody({ row }: { row: ActivityRow }) {
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-ink-strong text-[15px]">
          {row.actorName ?? "Someone"}
        </span>
        <SourceBadge source="employee" />
      </div>
      <div className="mt-1 text-[14.5px] text-ink" style={{ lineHeight: 1.5 }}>
        {employeeEventCopy(row)}
        {row.note ? (
          <span className="text-ink-subtle"> — {row.note}</span>
        ) : null}
      </div>
    </>
  );
}

function SettingsRowBody({ row }: { row: ActivityRow }) {
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-ink-strong text-[15px]">
          {row.actorName ?? "Someone"}
        </span>
        <SourceBadge source="settings" />
      </div>
      <div className="mt-1 text-[14.5px] text-ink" style={{ lineHeight: 1.5 }}>
        {settingsEventCopy(row)}
        {row.note ? (
          <span className="text-ink-subtle"> — {row.note}</span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Tiny pill rendered next to the actor name for non-task sources so the
 * reader can tell at a glance "this is an admin/employee action" without
 * scanning the verb.  Task rows skip the badge because the linked subject
 * already telegraphs the context.
 */
function SourceBadge({ source }: { source: ActivitySource }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.06em]"
      style={{
        color: SOURCE_TINTS[source],
        background: `color-mix(in srgb, ${SOURCE_TINTS[source]} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${SOURCE_TINTS[source]} 25%, transparent)`,
      }}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}


