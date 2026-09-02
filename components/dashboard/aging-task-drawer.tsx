"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { X, Maximize2, Minimize2, Archive, Trash2, Inbox } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { InlineStatusCell } from "@/components/tasks/inline-status-cell";
import { canEditTaskFields } from "@/lib/auth/task-permissions";
import { archiveTask, deleteTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { STATUS_LABELS_FALLBACK, STATUS_TONES_FALLBACK } from "@/lib/format";
import type { HeatmapCellTask, EisenhowerPriority } from "@/lib/types";
import { PRIORITY_LABELS, type TaskStatus, type StatusColorToken } from "@/db/enums";

/**
 * Priority → badge tone, in descending severity: Critical · Urgent · Important
 * · Normal.
 *
 * LABELS COME FROM `PRIORITY_LABELS` (db/enums.ts), not from a local copy. This
 * map previously hard-coded its own names and had drifted: it showed
 * `imp_not_urgent` as "Normal" and `not_imp_not_urgent` as "Low", so the same
 * task read one priority here and another in the task list. Only the colours
 * are local now.
 */
const PRIORITY_TONE: Record<EisenhowerPriority, string> = {
  imp_urgent: "bg-rose-100 text-rose-700 border-rose-200",
  not_imp_urgent: "bg-orange-100 text-orange-700 border-orange-200",
  imp_not_urgent: "bg-blue-100 text-blue-700 border-blue-200",
  not_imp_not_urgent: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Age pill tone — mirrors the heatmap's own three age tiers. */
function ageTone(days: number): string {
  if (days >= 31) return "bg-rose-100 text-rose-700 border-rose-200";
  if (days >= 15) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

/**
 * Three-quarter-width slide-over listing the pending tasks behind a heatmap
 * lane, bar segment, or age-bracket badge.
 *
 * The rows are PASSED IN, not fetched: they are the very tasks the heatmap
 * counted (same filters, same pending rule, same age bucketing), so the drawer
 * can never disagree with the bar that opened it, and opening costs no
 * round-trip.
 */
export function AgingTaskDrawer({
  open,
  title,
  subtitle,
  tasks,
  me,
  statusLabels,
  statusTones,
  avatarById = {},
  onClose,
}: {
  open: boolean;
  /** Filter context, e.g. 'Proveeka Makwana · 15-20 days Aging Tasks'. */
  title: string;
  /** One line under it stating the scope: "Showing all 3 pending tasks aged
   *  15-20 days." Optional so other callers keep the bare title. */
  subtitle?: string;
  tasks: HeatmapCellTask[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
  avatarById?: Record<string, string | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [full, setFull] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const labels = statusLabels ?? STATUS_LABELS_FALLBACK;
  const tones = statusTones ?? STATUS_TONES_FALLBACK;

  // Esc closes; the page behind must not scroll while the panel is up.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Reset the full-screen state each time the drawer opens, so one expanded
  // session doesn't silently change how the next lane presents itself.
  React.useEffect(() => {
    if (open) setFull(false);
  }, [open]);

  if (!open) return null;

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error ?? "Something went wrong." });
        return;
      }
      router.refresh();
      fireToast({ message: label });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close task list"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 backdrop-blur-xs"
      />

      <aside
        /* Narrowed from `max-w-6xl` (1152px), which left a triage list of two
           or three rows floating in a very wide panel — the "half-empty" half
           of the report that survives even once the missing rows are back.
           
           NOT to the `max-w-2xl` the brief named, though: 672px across six
           columns is ~110px each, and the task description — the column
           someone actually reads — would be a two-word sliver. 4xl (896px) is
           a real reduction that the table still fits. The full-screen toggle
           remains for anyone who wants the wide view back. */
        className={`wms-card relative flex h-full flex-col border-l bg-white shadow-2xl ${
          full ? "w-full" : "w-[70vw] max-w-2xl md:max-w-3xl lg:max-w-4xl"
        }`}
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[12px] font-medium text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-bold tabular-nums text-gray-700">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            title={full ? "Exit full screen" : "Full screen"}
            aria-label={full ? "Exit full screen" : "Full screen"}
            aria-pressed={full}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            {full ? <Minimize2 size={14} strokeWidth={2.6} /> : <Maximize2 size={14} strokeWidth={2.6} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        {/* ── Task table ── */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <Inbox size={26} strokeWidth={2} />
              <p className="text-[14px] font-semibold">
                No pending tasks found for this age bracket.
              </p>
            </div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr>
                  {["Task", "Initiator", "Doer", "Due · Age", "Priority", "Status", ""].map(
                    (h, i) => (
                      <th
                        key={h || i}
                        className={`sticky top-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 ${
                          i === 6 ? "sticky right-0 z-20" : ""
                        }`}
                        style={{ boxShadow: "inset 0 -1px 0 rgb(229 231 235)" }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const canEdit = canEditTaskFields({
                    employee: me,
                    task: {
                      createdById: t.createdById,
                      initiatorId: t.initiatorId,
                      doerId: t.doerId,
                      status: t.status,
                    },
                  });
                  const prioTone = PRIORITY_TONE[t.priority];
                  const prioLabel = PRIORITY_LABELS[t.priority];
                  // `description` is nullable, so fall back to the client name
                  // rather than rendering an empty row.
                  // DESCRIPTION ONLY. This fell back to `t.title`, and `title`
                  // in this schema is the CLIENT NAME — the New Task form's
                  // "Client Name" field writes straight to tasks.title. So
                  // every task without a description rendered as "Altus Corp" /
                  // "AA Tech" and the TASK column read as a client column. A
                  // task with no description now says so plainly rather than
                  // borrowing a label that describes someone else.
                  const taskText = t.description?.trim() || "No description provided";
                  // The hover carries what truncation ate: the FULL task text,
                  // plus the client on its own line so the tooltip still
                  // answers "whose?" even when the row is clipped short.
                  const taskHover = [
                    t.description?.trim(),
                    t.taskNo != null ? `Task #${t.taskNo}` : null,
                    `Client: ${t.title}`,
                  ]
                    .filter(Boolean)
                    .join("\n\n");
                  return (
                    <tr
                      key={t.id}
                      className="aging-drawer-row group h-11 border-b border-gray-100 transition-colors hover:bg-gray-50/80"
                    >
                      {/* What the task IS, and nothing else.
                          HEADS UP on the field names: in this schema `title` is
                          the CLIENT NAME — the New Task form's "Client Name"
                          field writes straight to tasks.title — and the work
                          itself lives in `description`. So leading with `title`
                          meant every row in a triage list read "Altus Corp",
                          which is the same for whole runs of rows and tells you
                          nothing about what is aging. `description` is the whole
                          label now; the client and the task number live in the
                          hover, so knowing whose work is stuck is still one
                          pointer away without costing the row a line. */}
                      {/* `title` on the <td> as well as the link so the hover
                          target is the whole cell, including the empty space
                          to the right of a short description. */}
                      <td className="max-w-[340px] px-4 py-3" title={taskHover}>
                        <Link
                          href={`/tasks/${t.id}` as Route}
                          // Native title, not a rich tooltip: this sits inside a
                          // horizontally-scrolling table with a sticky actions
                          // column, where a portalled popover has to be
                          // re-anchored on every scroll. The full text is the
                          // whole point of the hover, and the browser already
                          // wraps and positions it for free.
                          title={taskHover}
                          // Two lines, not one. The #id gutter and the
                          // trailing client moved into the hover: they spent
                          // the row's scarce width on an identifier nobody
                          // quotes and a client the tooltip still reports.
                          // `line-clamp-2` over `truncate` because these are
                          // real sentences and one clipped line usually stops
                          // before the verb; `break-words` keeps a long
                          // unbroken token from forcing a horizontal overflow.
                          className="block line-clamp-2 max-w-[340px] break-words text-xs font-semibold leading-normal text-slate-900 hover:underline"
                        >
                          {taskText}
                        </Link>
                        {/* THE CLIENT, BACK ON ITS OWN LINE.
                        
                            It was deliberately moved into the hover — leading a
                            triage row with `title` made every row read "Altus
                            Corp", because that column IS the client name in this
                            schema. That reasoning still holds for the LABEL, and
                            the label is still the description.
                        
                            This is the other half of it: a small muted tag
                            BENEATH the description names whose work is stuck
                            without competing with what the work is. Rendered
                            only when there is a client and it is not already the
                            label — on a task with no description `taskText`
                            falls back to the client, and repeating it here would
                            print the same string twice. */}
                        {t.title && taskText !== t.title && (
                          <span className="mt-1 block truncate text-[11px] font-medium text-slate-500">
                            {t.title}
                          </span>
                        )}
                      </td>

                      {/* Initiator — who gave the work */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <Person name={t.initiatorName} avatarUrl={avatarById[t.initiatorId] ?? null} />
                      </td>

                      {/* Doer */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <Person name={t.doerName} avatarUrl={avatarById[t.doerId] ?? null} />
                      </td>

                      {/* Due date + age. When the date has been revised, the
                          original is struck through beneath it — a task moved
                          from the 4th to the 20th reads as on-track otherwise,
                          which is exactly the case worth surfacing here. */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-[12px] font-medium tabular-nums text-gray-600">
                          {t.dueAt ? formatDate(t.dueAt) : "—"}
                        </span>
                        <span
                          className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${ageTone(t.ageDays)}`}
                        >
                          {t.ageDays}d
                        </span>
                        {t.originalDueAt &&
                          t.dueAt &&
                          new Date(t.originalDueAt).getTime() !== new Date(t.dueAt).getTime() && (
                            <span
                              className="block text-[10.5px] font-medium tabular-nums text-gray-400 line-through"
                              title="Original due date, before revision"
                            >
                              {formatDate(t.originalDueAt)}
                            </span>
                          )}
                      </td>

                      {/* Priority */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${prioTone}`}
                        >
                          {prioLabel}
                        </span>
                      </td>

                      {/* Inline status — the same cell the tasks table uses, so
                          editing here behaves identically (optimistic flip,
                          updatedAt lock, per-row permission gate). */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <InlineStatusCell
                          taskId={t.id}
                          status={t.status}
                          updatedAt={t.updatedAt}
                          labels={labels}
                          tones={tones}
                          isAdmin={me.isAdmin}
                          editable={canEdit}
                        />
                      </td>

                      {/* Frozen quick actions */}
                      <td
                        className="aging-drawer-actions sticky right-0 z-10 whitespace-nowrap px-3 py-1.5 text-right"
                        style={{ boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" }}
                      >
                        {me.isAdmin && (
                          <span className="inline-flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              type="button"
                              disabled={pending}
                              title={`Archive "${t.title}"`}
                              aria-label={`Archive ${t.title}`}
                              onClick={() => run("Task archived.", () => archiveTask(t.id))}
                              className="grid size-7 place-items-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            >
                              <Archive size={14} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              title={`Delete "${t.title}" permanently`}
                              aria-label={`Delete ${t.title}`}
                              onClick={() => {
                                if (!confirm(`Permanently delete "${t.title}"?`)) return;
                                run("Task deleted.", () => deleteTask(t.id));
                              }}
                              className="grid size-7 place-items-center rounded-md text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={14} strokeWidth={2.2} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}

function Person({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (!name) return <span className="text-[12px] text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar name={name} avatarUrl={avatarUrl} size={20} />
      <span className="max-w-[14ch] truncate text-[12.5px] font-semibold text-gray-700">
        {name}
      </span>
    </span>
  );
}
