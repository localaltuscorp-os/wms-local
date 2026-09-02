"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  AlarmClockOff,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import type { MyTodayTask } from "@/lib/queries/my-day";

const TZ = "Asia/Kolkata";

/** How many task cards show before the list collapses behind "View all". Kept
 *  small so Attendance + the first couple of tasks fit above the fold and the
 *  user never has to scroll past a long backlog to get into the app. */
const VISIBLE_LIMIT = 2;

/**
 * Client island for the mobile "Today" task list. Renders the user's overdue +
 * due-today cards, but shows only the first {@link VISIBLE_LIMIT} by default
 * with a "View all" toggle — so a big backlog doesn't bury the Attendance CTA.
 */
export function MobileTodayTasks({
  overdue,
  dueToday,
  statusLabels,
  statusTones,
}: {
  overdue: MyTodayTask[];
  dueToday: MyTodayTask[];
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const total = overdue.length + dueToday.length;

  // Overdue first (priority-ordered by the query), then due-today fills the
  // remaining budget. Group counts stay honest (full group size) even when the
  // visible slice is smaller.
  const visibleOverdue = expanded ? overdue : overdue.slice(0, VISIBLE_LIMIT);
  const dueBudget = expanded
    ? dueToday.length
    : Math.max(0, VISIBLE_LIMIT - visibleOverdue.length);
  const visibleDue = expanded ? dueToday : dueToday.slice(0, dueBudget);
  const hidden = total - (visibleOverdue.length + visibleDue.length);

  return (
    <>
      {visibleOverdue.length > 0 && (
        <TaskGroup
          icon={<AlarmClockOff size={15} strokeWidth={2.2} aria-hidden />}
          label="Overdue"
          count={overdue.length}
          tone="red"
        >
          {visibleOverdue.map((t) => (
            <TodayCard key={t.id} task={t} statusLabels={statusLabels} statusTones={statusTones} />
          ))}
        </TaskGroup>
      )}
      {visibleDue.length > 0 && (
        <TaskGroup
          icon={<CalendarCheck2 size={15} strokeWidth={2.2} aria-hidden />}
          label="Due today"
          count={dueToday.length}
          tone="blue"
        >
          {visibleDue.map((t) => (
            <TodayCard key={t.id} task={t} statusLabels={statusLabels} statusTones={statusTones} />
          ))}
        </TaskGroup>
      )}

      {total > VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-pill border border-hairline bg-surface-card font-semibold text-ink-soft transition-colors active:bg-surface-soft"
          style={{ fontSize: 14.5 }}
        >
          {expanded ? "Show less" : `View all ${total} tasks`}
          <ChevronDown
            size={16}
            strokeWidth={2.4}
            aria-hidden
            style={{
              transition: "transform 200ms ease",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          />
          {!expanded && hidden > 0 && (
            <span
              className="ml-0.5 inline-flex items-center justify-center rounded-full bg-altus-red px-1.5 font-bold text-white tabular-nums"
              style={{ fontSize: 11.5, minWidth: 18, height: 18 }}
            >
              +{hidden}
            </span>
          )}
        </button>
      )}
    </>
  );
}

function TaskGroup({
  icon,
  label,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "red" | "blue";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-1.5 px-0.5">
        <span style={{ color: `var(--color-${tone}-deep)` }}>{icon}</span>
        <h2
          className="font-bold uppercase"
          style={{
            fontSize: 12.5,
            letterSpacing: "0.08em",
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {label}
        </h2>
        <span className="text-ink-subtle font-semibold tabular-nums" style={{ fontSize: 12.5 }}>
          {count}
        </span>
      </div>
      <ul className="mt-2.5 grid gap-2.5">{children}</ul>
    </div>
  );
}

function TodayCard({
  task,
  statusLabels,
  statusTones,
}: {
  task: MyTodayTask;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const title =
    task.title?.trim() || task.description?.trim() || task.subject?.trim() || "Untitled task";
  const meta = [task.client?.trim(), task.subject?.trim()].filter(Boolean).join(" · ");
  const tone = statusTones[task.status] ?? "slate";
  const dueLabel = task.overdue
    ? task.dueAt
      ? `Due ${new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" }).format(task.dueAt)}`
      : "Overdue"
    : "Due today";

  return (
    <li>
      <Link
        href={`/tasks/${task.id}` as Route}
        className="block rounded-section border bg-surface-card p-4 transition-colors active:bg-surface-soft"
        style={{
          borderColor: task.overdue
            ? "color-mix(in srgb, var(--color-red) 35%, transparent)"
            : "var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className="text-ink-strong min-w-0 flex-1 font-semibold"
            style={{
              fontSize: 17,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {task.taskNo != null && (
              <span className="text-ink-subtle font-bold tabular-nums" style={{ fontSize: 14 }}>
                #{task.taskNo}{" "}
              </span>
            )}
            {title}
          </p>
          <ChevronRight size={18} strokeWidth={2.2} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden />
        </div>

        {meta && (
          <p className="text-ink-muted mt-1 truncate" style={{ fontSize: 14.5 }}>
            {meta}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {task.priority === "imp_urgent" ? (
            <CriticalBadge />
          ) : (
            <span className="text-ink-soft font-semibold" style={{ fontSize: 13 }}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}
          <span
            className="inline-flex items-center rounded-pill px-2.5 py-1 font-semibold"
            style={{
              fontSize: 12.5,
              background: `var(--color-${tone}-bg)`,
              color: `var(--color-${tone}-deep)`,
            }}
          >
            {statusLabels[task.status] ?? task.status}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{
              fontSize: 13,
              color: task.overdue ? "var(--color-red-deep)" : "var(--color-ink-soft)",
            }}
          >
            {dueLabel}
          </span>
        </div>
      </Link>
    </li>
  );
}
