"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Flag,
  UserCog,
  Archive,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  Tag,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { fireToast } from "@/lib/toast";
import {
  bulkSetStatus,
  bulkSetPriority,
  bulkReassignDoer,
  bulkSetSubject,
  bulkSetClient,
  bulkArchive,
  bulkDelete,
} from "@/app/(app)/tasks/actions";
import {
  USER_TASK_STATUSES,
  ADMIN_TASK_STATUSES,
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
} from "@/db/enums";

type BulkResult =
  | { ok: true; updated: number; skipped: number }
  | { ok: false; error: string };

/**
 * Floating toolbar shown when ≥1 task is selected in the list. Offers the
 * batch actions (status / priority / reassign, plus admin-only archive +
 * delete) over the current selection, then clears it. Permissions mirror the
 * single-task actions — the server re-checks regardless.
 */
export function BulkActionBar({
  selectedIds,
  employees,
  subjects = [],
  clients = [],
  isAdmin,
  statusLabels,
  onClear,
}: {
  selectedIds: string[];
  employees: { id: string; name: string }[];
  subjects?: string[];
  clients?: string[];
  isAdmin: boolean;
  statusLabels: Record<TaskStatus, string>;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const count = selectedIds.length;

  function run(verb: string, fn: () => Promise<BulkResult>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message:
          res.skipped > 0
            ? `${verb} ${res.updated} task${res.updated === 1 ? "" : "s"} — ${res.skipped} skipped (no permission or no change).`
            : `${verb} ${res.updated} task${res.updated === 1 ? "" : "s"}.`,
      });
      onClear();
      router.refresh();
    });
  }

  const statuses = (isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES) as readonly TaskStatus[];

  return (
    <div
      className="sticky top-[150px] z-30 mb-3 flex items-center gap-2 flex-wrap rounded-section border border-hairline bg-surface-card px-4 py-2.5 max-md:top-[120px]"
      style={{ boxShadow: "0 6px 20px -8px rgba(15,23,42,0.18)" }}
      role="region"
      aria-label="Bulk actions"
    >
      <span className="inline-flex items-center gap-2 text-[14px] font-bold text-ink-strong">
        {pending && <Loader2 size={14} className="animate-spin text-altus-red" />}
        {count} selected
      </span>

      <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending} className={chipBtn}>
            <CheckCircle2 size={14} strokeWidth={2.2} />
            Status
            <ChevronDown size={13} className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Set status to…</DropdownMenuLabel>
          {statuses.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => run("Updated", () => bulkSetStatus(selectedIds, s))}
            >
              {statusLabels[s] ?? s}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending} className={chipBtn}>
            <Flag size={14} strokeWidth={2.2} />
            Priority
            <ChevronDown size={13} className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Set priority to…</DropdownMenuLabel>
          {TASK_PRIORITIES.map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() =>
                run("Updated", () => bulkSetPriority(selectedIds, p as TaskPriority))
              }
            >
              {PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reassign */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending} className={chipBtn}>
            <UserCog size={14} strokeWidth={2.2} />
            Reassign
            <ChevronDown size={13} className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Reassign doer to…</DropdownMenuLabel>
          {employees.map((e) => (
            <DropdownMenuItem
              key={e.id}
              onSelect={() => run("Reassigned", () => bulkReassignDoer(selectedIds, e.id))}
            >
              {e.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Subject */}
      {subjects.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={pending} className={chipBtn}>
              <Tag size={14} strokeWidth={2.2} />
              Subject
              <ChevronDown size={13} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Set subject to…</DropdownMenuLabel>
            {subjects.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => run("Updated", () => bulkSetSubject(selectedIds, s))}
              >
                {s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Client */}
      {clients.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={pending} className={chipBtn}>
              <Building2 size={14} strokeWidth={2.2} />
              Client
              <ChevronDown size={13} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Set client to…</DropdownMenuLabel>
            {clients.map((c) => (
              <DropdownMenuItem
                key={c}
                onSelect={() => run("Updated", () => bulkSetClient(selectedIds, c))}
              >
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isAdmin && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Archive ${count} task${count === 1 ? "" : "s"}?`)) {
                run("Archived", () => bulkArchive(selectedIds));
              }
            }}
            className={chipBtn}
          >
            <Archive size={14} strokeWidth={2.2} />
            Archive
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  `Permanently delete ${count} task${count === 1 ? "" : "s"}?\n\nThis removes the tasks and their history and cannot be undone.`,
                )
              ) {
                run("Deleted", () => bulkDelete(selectedIds));
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[13px] font-bold text-altus-red hover:bg-altus-red/8 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={2.2} />
            Delete
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
      >
        <X size={14} strokeWidth={2.4} />
        Clear
      </button>
    </div>
  );
}

const chipBtn =
  "inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[13px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red transition-colors disabled:opacity-50";
