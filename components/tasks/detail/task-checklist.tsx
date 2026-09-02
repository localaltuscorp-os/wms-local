"use client";

/**
 * Task Checklist card. Renders a task's checklist with an inline progress bar,
 * per-item toggle, hover-to-delete, and (when editable) a keyboard-first add
 * row. All mutations go through the checklist Server Actions and refresh the
 * server-rendered list.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ListChecks, Plus, Trash2 } from "lucide-react";
import type { ChecklistItemView } from "@/lib/queries/task-detail-extras";
import {
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
} from "@/app/(app)/tasks/checklist-actions";
import { fireToast } from "@/lib/toast";

export function TaskChecklist({
  taskId,
  items,
  canEdit,
}: {
  taskId: string;
  items: ChecklistItemView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      router.refresh();
    });
  }

  function handleAdd() {
    const label = draft.trim();
    if (!label) return;
    setDraft("");
    inputRef.current?.focus();
    run(() => addChecklistItem(taskId, label));
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
          <ListChecks className="h-4 w-4 text-ink-subtle" aria-hidden />
          Checklist
        </h3>
        <span className="text-xs font-medium tabular-nums text-ink-muted">
          {doneCount}/{total} completed
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Checklist completion"
      >
        <div
          className="h-full rounded-full bg-altus-red transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Items */}
      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-hairline bg-surface-soft/50 px-3 py-6 text-center text-sm text-ink-subtle">
          No checklist items yet.
          {canEdit ? " Add one below to break this task down." : ""}
        </p>
      ) : (
        <ul className="mt-3 space-y-0.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-soft/60"
            >
              <button
                type="button"
                onClick={() => run(() => toggleChecklistItem(item.id))}
                disabled={isPending}
                className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 disabled:opacity-60"
                aria-pressed={item.done}
                aria-label={item.done ? `Mark "${item.label}" not done` : `Mark "${item.label}" done`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 text-ink-subtle/60 transition-colors group-hover:text-ink-subtle" aria-hidden />
                )}
              </button>

              <span
                className={
                  "min-w-0 flex-1 break-words text-sm " +
                  (item.done ? "text-ink-subtle line-through" : "text-ink-strong")
                }
              >
                {item.label}
              </span>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => run(() => deleteChecklistItem(item.id))}
                  disabled={isPending}
                  className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-opacity hover:bg-altus-red/10 hover:text-altus-red focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 group-hover:opacity-100 disabled:opacity-60"
                  aria-label={`Delete "${item.label}"`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add row */}
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add item…"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface-soft/40 px-3 py-2 text-sm text-ink-strong placeholder:text-ink-subtle outline-none focus:border-altus-red/40 focus:bg-white focus:ring-2 focus:ring-altus-red/20"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !draft.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink-strong transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Add checklist item"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </button>
        </div>
      )}
    </section>
  );
}
