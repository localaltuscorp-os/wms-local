"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowRight, Inbox } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/format";
import type { StatusCellBucket, StatusCellTask, ViewMode } from "@/lib/types";

/** 200ms before opening — long enough that dragging the pointer across a row
 *  of six cells (or scrolling past them) doesn't flash a popover per cell. */
const OPEN_DELAY_MS = 200;

/** Column label + the /tasks filter that reproduces it. */
const BUCKET_META: Record<
  StatusCellBucket,
  { label: string; params: (v: ViewMode) => URLSearchParams }
> = {
  criticalCount: {
    label: "Critical",
    params: () => new URLSearchParams({ prio: "imp_urgent" }),
  },
  // ── One entry per status column ──────────────────────────────────────────
  // The label is the COLUMN's label, verbatim, so the popover header names the
  // thing the reader is pointing at. The params reproduce that column's exact
  // set in /tasks — `status` is comma-separated there (lib/task-filters.ts),
  // which is what lets the collapsed columns list every status they fold in.
  approved: { label: "Approved", params: () => new URLSearchParams({ status: "approved" }) },
  done: { label: "Done", params: () => new URLSearchParams({ status: "done" }) },
  transferred: {
    label: "Transferred",
    params: () => new URLSearchParams({ status: "transferred" }),
  },
  // Follow Up counts the legacy numbered variants too, so the link has to name
  // all four or it would open a shorter list than the badge promised.
  followUp: {
    label: "Follow Up",
    params: () =>
      new URLSearchParams({ status: "follow_up,follow_up_1,follow_up_2,follow_up_3" }),
  },
  // "Need Info" absorbed the retired `need_help` (2026-06-10); historical rows
  // still carry it and the column still counts them.
  needHelp: {
    label: "Need Info",
    params: () => new URLSearchParams({ status: "need_info,need_help" }),
  },
  initiated: { label: "Initiated", params: () => new URLSearchParams({ status: "initiated" }) },
  notStarted: {
    label: "Not Started",
    params: () => new URLSearchParams({ status: "not_started" }),
  },
  dontKnow: { label: "Not Read", params: () => new URLSearchParams({ status: "dont_know" }) },
  onHold: { label: "On Hold", params: () => new URLSearchParams({ status: "on_hold" }) },
  pendingTotal: {
    label: "Pending",
    // The exact set computeEmployeeStatusTable counts as pending. `dont_know`
    // and `on_hold` are deliberately absent — they fall through that switch
    // into no bucket, so including them here would make the link show MORE
    // tasks than the badge counted.
    params: () =>
      new URLSearchParams({
        status: "not_started,initiated,follow_up,follow_up_1,follow_up_2,follow_up_3,need_info",
      }),
  },
  notApproved: {
    label: "Not Approved",
    params: () => new URLSearchParams({ status: "not_approved" }),
  },
  cancelled: {
    label: "Cancelled",
    params: () => new URLSearchParams({ status: "cancelled" }),
  },
  total: { label: "Total", params: () => new URLSearchParams() },
};

/**
 * Hover preview for a count badge in the Status-by-Doer table.
 *
 * The task list is NOT fetched here. It arrives with the row, built in the same
 * pass as the count (see computeEmployeeStatusTable), so the preview can never
 * disagree with the number it hangs off — and hovering costs no round-trip.
 *
 * Zero-count cells render the badge bare: there is nothing to preview, and a
 * popover saying "no tasks" is just a thing to dismiss.
 */
export function StatusCellPopover({
  children,
  employeeName,
  employeeId,
  bucket,
  count,
  tasks,
  view,
}: {
  children: React.ReactNode;
  employeeName: string;
  employeeId: string;
  bucket: StatusCellBucket;
  count: number;
  tasks: StatusCellTask[] | undefined;
  view: ViewMode;
}) {
  if (count <= 0 || !tasks || tasks.length === 0) return <>{children}</>;

  const meta = BUCKET_META[bucket];
  const params = meta.params(view);
  // Scope to the person the row is about — by DOER or INITIATOR, matching the
  // dimension the table was aggregated on, or the link would open a list that
  // counts differently.
  // `doer` is the assignee alias /tasks understands (lib/task-filters.ts folds
  // it into `emp`), so the link reads the way the board describes it.
  params.set(view === "doer" ? "doer" : "initiator", employeeId);
  const href = `/tasks?${params.toString()}` as Route;

  return (
    <Tooltip.Provider delayDuration={OPEN_DELAY_MS} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex cursor-default">{children}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 rounded-lg border shadow-lg"
            style={{
              width: 320,
              // 380 is the ceiling, not the width: a long description gets room
              // to breathe where the viewport allows, and the clamp still wins
              // on a narrow screen.
              maxWidth: "min(380px, calc(100vw - 32px))",
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline-strong)",
            }}
          >
            <div className="px-3.5 pt-3 pb-2">
              <p className="text-[12.5px] font-black leading-tight text-ink-strong">
                {employeeName}
                <span className="mx-1.5 text-ink-subtle">•</span>
                {meta.label} Tasks
                <span className="ml-1 tabular-nums text-ink-soft">({count})</span>
              </p>
            </div>

            <ul className="flex flex-col border-t" style={{ borderColor: "var(--color-hairline)" }}>
              {tasks.map((t) => {
                // DESCRIPTION ONLY. This fell back through `subject` and then
                // `title`, and BOTH fallbacks were the problem: `subject` is a
                // category ("WMS App", "App"), so a run of rows reads
                // identically, and `title` in this schema is the CLIENT NAME —
                // the New Task form's "Client Name" field writes straight to
                // tasks.title. Neither says what the work is. A task with no
                // description says so rather than borrowing a label that lies.
                const text = t.description?.trim() || "Untitled task";
                // The identifiers that used to occupy the row -- the #number
                // gutter and the client chip -- moved in here. Nothing is lost;
                // they just stop competing with the description for the two
                // lines the reader actually scans.
                const hover = [
                  text,
                  t.taskNo != null ? `Task #${t.taskNo}` : null,
                  t.client ? `Client: ${t.client}` : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <li key={t.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-hairline)" }}>
                    {/* The ROW is a link now, to the same filtered list the
                        footer opens — not to the single task. The reader is
                        pointing at a COUNT, so the row is a sample of that set
                        rather than a specific thing they picked. */}
                    <Link
                      href={href}
                      className="flex items-start gap-2 rounded-lg p-2.5 transition-colors hover:bg-slate-50"
                    >
                      {/* Two lines, not one: these are full task descriptions
                          and a single-line truncate turned most of them into a
                          stub. `break-words` keeps a long unbroken token from
                          forcing a horizontal overflow. */}
                      <span
                        className="min-w-0 flex-1 line-clamp-2 break-words text-xs font-semibold leading-snug text-slate-900"
                        title={hover}
                      >
                        {text}
                      </span>
                      {/* Urgency is the only metadata left, pinned right so the
                          description gets the full width of the row. */}
                      <DueChip dueAt={t.dueAt} />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="border-t px-3.5 py-2" style={{ borderColor: "var(--color-hairline)" }}>
              <Link
                href={href}
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-black text-altus-red transition-colors hover:text-altus-red-deep"
              >
                View all {count} task{count === 1 ? "" : "s"}
                <ArrowRight
                  size={12}
                  strokeWidth={2.8}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              {count > tasks.length && (
                <span className="ml-2 text-[10.5px] font-semibold text-ink-subtle">
                  showing {tasks.length} most urgent
                </span>
              )}
            </div>
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** Due date, coloured by how late it is. */
function DueChip({ dueAt }: { dueAt: Date | null }) {
  if (!dueAt) return <span className="text-[10px] font-semibold text-ink-subtle">No due date</span>;
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt as unknown as string);
  if (Number.isNaN(d.getTime()))
    return <span className="text-[10px] font-semibold text-ink-subtle">—</span>;

  const days = differenceInCalendarDays(d, new Date());
  const overdue = days < 0;
  const today = days === 0;
  // A PILL, not bare coloured text. Beside a two-line description a loose
  // coloured word reads as part of the sentence; a filled chip reads as status.
  // `shrink-0` so a long description can never squeeze "20d overdue" onto two
  // lines or crop it.
  const tone = overdue
    ? "text-red-600 bg-red-50"
    : today
      ? "text-amber-700 bg-amber-50"
      : "text-slate-500 bg-slate-50";
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}
    >
      {overdue
        ? `${Math.abs(days)}d overdue`
        : today
          ? "Due today"
          : formatDate(d)}
    </span>
  );
}

/** Exported for the empty case so callers don't need their own import. */
export const StatusCellEmptyIcon = Inbox;
