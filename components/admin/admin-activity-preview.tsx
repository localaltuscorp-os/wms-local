import Link from "next/link";
import type { Route } from "next";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  FileText,
  Settings as SettingsIcon,
  UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AuditEvent } from "@/components/tasks/audit-event";
import { dotColorFor } from "@/components/tasks/audit-event-meta";
import type { ActivityRow, ActivitySource } from "@/lib/transforms/activity";
import {
  employeeEventCopy,
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

interface Props {
  events: ActivityRow[];
  statusLabels?: Record<TaskStatus, string>;
}

/**
 * Compact (≤5-row) activity preview rendered on the admin overview.
 * Links out to /admin/activity for the full timeline.
 */
export function AdminActivityPreview({ events, statusLabels }: Props) {
  return (
    <section
      className="rounded-section bg-surface-card border border-hairline overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-hairline">
        <div>
          <div className="text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
            Recent
          </div>
          <h2
            className="font-serif text-ink-strong"
            style={{
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              marginTop: 2,
            }}
          >
            Activity
          </h2>
        </div>
        <Link
          href={"/admin/activity" as Route}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-soft hover:text-altus-red transition-colors"
        >
          View all
          <ArrowRight size={14} strokeWidth={2.4} />
        </Link>
      </header>

      {events.length === 0 ? (
        <div className="text-center py-12 text-ink-subtle italic text-[15px]">
          No activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {events.map((row) => (
            <PreviewItem key={row.id} row={row} statusLabels={statusLabels} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Single row of the compact activity preview.  Dispatches on `row.source`
 * so task rows keep their existing AuditEvent body while employee/settings
 * rows get their own per-source copy and source-kind icon overlay.
 */
function PreviewItem({
  row,
  statusLabels,
}: {
  row: ActivityRow;
  statusLabels?: Record<TaskStatus, string>;
}) {
  const relative = formatDistanceToNow(row.createdAt, { addSuffix: true });

  return (
    <li className="flex items-start gap-3 px-5 py-3.5 hover:bg-[rgba(15,23,42,0.015)] transition-colors">
      <PreviewActorBlock row={row} />

      <div className="flex-1 min-w-0">
        {row.source === "task" ? (
          <PreviewTaskBody row={row} statusLabels={statusLabels} />
        ) : row.source === "employee" ? (
          <PreviewInlineBody row={row} text={employeeEventCopy(row)} />
        ) : (
          <PreviewInlineBody row={row} text={settingsEventCopy(row)} />
        )}
      </div>

      <div className="shrink-0 text-[12.5px] text-ink-subtle tabular-nums whitespace-nowrap">
        {relative}
      </div>
    </li>
  );
}

function PreviewActorBlock({ row }: { row: ActivityRow }) {
  if (row.source === "task") {
    const dot = dotColorFor(row.eventType as import("@/lib/events").TaskEventType);
    return (
      <div className="relative shrink-0">
        <Avatar
          name={row.actorName ?? "?"}
          avatarUrl={row.actorAvatarUrl}
          size={30}
        />
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 rounded-full"
          style={{
            width: 9,
            height: 9,
            background: dot,
            boxShadow: "0 0 0 2px var(--color-surface-card)",
          }}
        />
      </div>
    );
  }

  const Icon = SOURCE_ICONS[row.source];
  return (
    <div className="relative shrink-0">
      <Avatar
        name={row.actorName ?? "?"}
        avatarUrl={row.actorAvatarUrl}
        size={30}
      />
      <span
        aria-hidden
        className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full"
        style={{
          width: 16,
          height: 16,
          background: "var(--color-surface-card)",
          boxShadow: "0 0 0 1.5px var(--color-surface-card)",
          color: SOURCE_TINTS[row.source],
        }}
      >
        <Icon size={10} strokeWidth={2.4} aria-hidden />
      </span>
    </div>
  );
}

function PreviewTaskBody({
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
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <Link
          href={`/tasks/${row.taskId}` as Route}
          className="text-[14px] font-semibold text-ink-strong hover:text-altus-red transition-colors max-w-[36ch] truncate"
          title={subject}
        >
          {subject}
        </Link>
      </div>
      <div className="mt-1 text-[14px] text-ink-soft audit-inline">
        <AuditEvent row={auditRow} statusLabels={statusLabels} />
      </div>
    </>
  );
}

function PreviewInlineBody({ row, text }: { row: ActivityRow; text: string }) {
  return (
    <>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[14px] font-semibold text-ink-strong">
          {row.actorName ?? "Someone"}
        </span>
      </div>
      <div className="mt-1 text-[14px] text-ink-soft">
        {text}
        {row.note ? (
          <span className="text-ink-subtle"> — {row.note}</span>
        ) : null}
      </div>
    </>
  );
}
