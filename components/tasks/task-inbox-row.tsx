"use client";

import * as React from "react";
import { Star, Archive, Trash2, MailOpen, Mail, Loader2 } from "lucide-react";
import { InlineStatusCell } from "./inline-status-cell";
import { InlineDoerCell, InlinePriorityCell } from "./inline-edit-cells";
import { canEditTaskFields } from "@/lib/auth/task-permissions";
import type { TaskListRow } from "@/lib/types";
import type { TaskStatus, TaskPriority, StatusColorToken } from "@/db/enums";

/**
 * One row of the inbox feed, carrying the full column set:
 *
 *   [✓] [★] [#id] [client] [subject] [title — snippet]
 *       [doer ▾] [priority ▾] [status ▾] [due] [age] │ [archive] [delete]
 *
 * The three dropdowns are the SAME components the old table used, so inline
 * editing behaves identically — optimistic flip, optimistic-lock token on
 * `updatedAt`, per-row permission gating. Nothing was reimplemented.
 *
 * WIDTH: eleven columns do not fit in a 38%-wide pane, so the row declares a
 * min-width and the list scrolls sideways. The actions cell is `sticky right-0`
 * against that scrollport, which is why it needs an OPAQUE background — see the
 * `.inbox-row > .inbox-actions-cell` rules in globals.css. A translucent tint
 * would let the scrolled-under columns show straight through it.
 */
export function TaskInboxRow({
  row,
  selected,
  checked,
  starred,
  isCursor,
  employees,
  me,
  statusLabels,
  statusTones,
  onOpen,
  onToggleCheck,
  onToggleStar,
  onToggleRead,
  onArchive,
  onDelete,
  canManage,
}: {
  row: TaskListRow;
  selected: boolean;
  checked: boolean;
  starred: boolean;
  isCursor: boolean;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  /** Complete maps — the inline status cell has no fallback of its own. */
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
  onOpen: () => void;
  onToggleCheck: (shiftKey: boolean) => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
  onArchive: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const unread = row.firstReadAt == null;

  // Status editability follows the same rule the table applied — not everyone
  // who can SEE a task may move it.
  const canEditStatus = canEditTaskFields({
    employee: me,
    task: {
      createdById: row.createdById,
      initiatorId: row.initiatorId,
      doerId: row.doerId,
      status: row.status,
    },
  });

  function withBusy(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      setBusy(true);
      fn();
      window.setTimeout(() => setBusy(false), 600);
    };
  }

  /** The dropdowns live inside a row whose click opens the task. Swallow
   *  clicks originating in an editing cell so changing a status never also
   *  navigates the detail pane. */
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onOpen}
      data-state={selected ? "selected" : unread ? "unread" : "read"}
      className={[
        "inbox-row group relative flex min-w-[1140px] items-center gap-2 border-b border-hairline px-2.5 py-1.5 transition-colors",
        selected
          ? "bg-altus-red/[0.06]"
          : unread
            ? "bg-surface-card hover:bg-surface-soft"
            : "bg-surface-soft/40 hover:bg-surface-soft",
        isCursor && !selected ? "ring-1 ring-inset ring-altus-red/30" : "",
      ].join(" ")}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: "var(--color-altus-red)" }}
        />
      )}

      {/* 1 · Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onClick={stop}
        onChange={(e) =>
          onToggleCheck((e.nativeEvent as MouseEvent).shiftKey === true)
        }
        aria-label={`Select ${row.title}`}
        className="size-[15px] shrink-0 cursor-pointer accent-[var(--color-altus-red)]"
      />

      {/* Star — kept from the previous pass. Sits with the checkbox the way
          every mail client pairs them, ahead of the data columns. */}
      <button
        type="button"
        onClick={withBusy(onToggleStar)}
        aria-label={starred ? "Unstar task" : "Star task"}
        aria-pressed={starred}
        className="shrink-0 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin text-ink-subtle" />
        ) : (
          <Star
            size={14}
            strokeWidth={2.2}
            className={starred ? "text-amber-500" : "text-ink-subtle/50 hover:text-amber-500"}
            fill={starred ? "currentColor" : "none"}
          />
        )}
      </button>

      {/* 2 · ID No. */}
      <span
        className={[
          "w-[52px] shrink-0 tabular-nums text-[11.5px]",
          unread ? "font-black text-ink-strong" : "font-bold text-ink-subtle",
        ].join(" ")}
      >
        {row.taskNo != null ? `#${row.taskNo}` : "—"}
      </span>

      {/* 3 · Client */}
      <span className="w-[104px] shrink-0">
        {row.client ? (
          <span
            className="block truncate rounded-chip px-1.5 py-0.5 text-[10.5px] font-bold"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
              color: "var(--color-altus-red-deep)",
            }}
            title={row.client}
          >
            {row.client}
          </span>
        ) : (
          <span className="text-[11px] text-ink-subtle/60">—</span>
        )}
      </span>

      {/* 4 · Subject */}
      <span className="w-[104px] shrink-0">
        {row.subject ? (
          <span
            className="block truncate rounded-chip bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft"
            title={row.subject}
          >
            {row.subject}
          </span>
        ) : (
          <span className="text-[11px] text-ink-subtle/60">—</span>
        )}
      </span>

      {/* 5 · Title + snippet — the only elastic column. */}
      <div className="flex min-w-[200px] flex-1 items-baseline gap-1.5">
        <span
          className={[
            "shrink-0 truncate text-[13px] max-w-[52%]",
            unread ? "font-black text-ink-strong" : "font-semibold text-ink-soft",
          ].join(" ")}
          title={row.title}
        >
          {row.title}
        </span>
        {row.description && (
          <span className="truncate text-[12px] font-normal text-ink-subtle">
            — {row.description}
          </span>
        )}
      </div>

      {/* 6 · Doer dropdown */}
      <span className="w-[132px] shrink-0" onClick={stop}>
        <InlineDoerCell
          taskId={row.id}
          doerId={row.doerId}
          doerName={row.doerName}
          employees={employees}
          editable={me.isAdmin}
        />
      </span>

      {/* 7 · Priority dropdown */}
      <span className="w-[124px] shrink-0" onClick={stop}>
        <InlinePriorityCell
          taskId={row.id}
          priority={row.priority as TaskPriority}
          editable={me.isAdmin}
        />
      </span>

      {/* 8 · Status dropdown */}
      <span className="w-[152px] shrink-0" onClick={stop}>
        <InlineStatusCell
          taskId={row.id}
          status={row.status}
          updatedAt={row.updatedAt}
          labels={statusLabels}
          tones={statusTones}
          isAdmin={me.isAdmin}
          editable={canEditStatus}
        />
      </span>

      {/* 9 · Due date (created shown on hover) */}
      <span
        className={[
          "w-[76px] shrink-0 tabular-nums text-[11.5px]",
          unread ? "font-bold text-ink-strong" : "font-medium text-ink-subtle",
        ].join(" ")}
        title={`Created ${formatDate(row.createdAt)}`}
      >
        {formatDate(row.dueAt)}
      </span>

      {/* 10 · Age */}
      {/* ageDays is DUE-relative (see lib/queries/tasks.ts): positive = days
          late, 0 = due today, negative = days still left. The old wording said
          "N days old" and the thresholds assumed a value that only ever grew
          from 0 — both were true of a created-relative age and neither is now.
          A task 3 days early would have read "-3 days old" in grey. */}
      <span
        className="w-[46px] shrink-0 tabular-nums text-[11.5px] font-bold"
        title={
          row.ageDays > 0
            ? `${row.ageDays} day${row.ageDays === 1 ? "" : "s"} past due`
            : row.ageDays === 0
              ? "Due today"
              : `${Math.abs(row.ageDays)} day${row.ageDays === -1 ? "" : "s"} until due`
        }
        style={{
          color:
            row.ageDays >= 30
              ? "var(--color-altus-red)"
              : row.ageDays >= 7
                ? "var(--color-amber-deep)"
                : "var(--color-ink-subtle)",
        }}
      >
        {row.ageDays}d
      </span>

      {/* 11 · Frozen actions pane */}
      <span
        className="inbox-actions-cell sticky right-0 z-10 flex shrink-0 items-center gap-0.5 border-l border-hairline pl-1.5"
        onClick={stop}
      >
        <IconAction
          label={unread ? "Mark as read" : "Mark as unread"}
          onClick={withBusy(onToggleRead)}
        >
          {unread ? <MailOpen size={14} /> : <Mail size={14} />}
        </IconAction>
        {canManage && (
          <>
            <IconAction label="Archive" onClick={withBusy(onArchive)}>
              <Archive size={14} />
            </IconAction>
            <IconAction label="Delete" onClick={withBusy(onDelete)} danger>
              <Trash2 size={14} />
            </IconAction>
          </>
        )}
      </span>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40",
        danger
          ? "text-ink-subtle hover:bg-altus-red/10 hover:text-altus-red"
          : "text-ink-subtle hover:bg-surface-card hover:text-ink-strong",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Compact date: "12 Aug" in-year, "12/08/25" otherwise. */
function formatDate(d: Date): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
