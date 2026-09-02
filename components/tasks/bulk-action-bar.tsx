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
  BadgeCheck,
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
  bulkSetApprovalStatus,
} from "@/app/(app)/tasks/actions";
import {
  DOER_TASK_STATUSES,
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
  type ApprovalStatus,
} from "@/db/enums";

type BulkResult =
  | { ok: true; updated: number; skipped: number }
  | { ok: false; error: string };

/**
 * The MANAGER's five rulings, in the order they appear under "Manager Status".
 *
 * They write two different columns, which is precisely why they are grouped
 * here and not in the Doer Status dropdown above:
 *
 *   • `kind: "status"`   → `tasks.status`.  Hold On and Done are still points on
 *     the work's own lifecycle; a manager is just moving it there directly.
 *   • `kind: "approval"` → `tasks.approval_status`.  Approved / Not Approved /
 *     Cancelled are VERDICTS on finished work, deliberately kept independent of
 *     the doer's lifecycle. `cancelled` in particular is a RETIRED value of
 *     `status`, so routing it through bulkSetStatus would write something no
 *     picker renders.
 *
 * `verb` feeds the result toast ("Approved 4 tasks.").
 */
const MANAGER_MARK_ACTIONS = [
  { kind: "status", value: "on_hold", label: "Mark Hold On", verb: "Put on hold" },
  { kind: "approval", value: "approved", label: "Mark Approved", verb: "Approved" },
  { kind: "approval", value: "not_approved", label: "Mark Not Approved", verb: "Rejected" },
  { kind: "status", value: "done", label: "Mark Done", verb: "Marked done" },
  { kind: "approval", value: "cancelled", label: "Mark Cancelled", verb: "Cancelled" },
] as const satisfies readonly (
  | { kind: "status"; value: TaskStatus; label: string; verb: string }
  | { kind: "approval"; value: ApprovalStatus; label: string; verb: string }
)[];

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

  // The batch twin of the row's inline status chip, and offering the SAME six
  // options for the same reason: this control reports the doer's progress. The
  // manager's rulings (hold / approve / decline / cancel) are the "Manager
  // Status" dropdown further along the bar.
  const statuses: readonly TaskStatus[] = DOER_TASK_STATUSES;

  return (
    <div
      className="wg-rise sticky top-[150px] z-30 mb-3 flex items-center gap-2 flex-wrap overflow-hidden rounded-section border px-4 py-2.5 max-md:top-[120px]"
      style={{
        borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,251,252,0.86))",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        boxShadow:
          "0 12px 32px -12px rgba(225, 6, 0, 0.18), 0 6px 20px -8px rgba(15,23,42,0.16)",
      }}
      role="region"
      aria-label="Bulk actions"
    >
      {/* CONTROL ORDER IS A CONTRACT — left to right:
            [N] selected · Doer Status · Priority · Reassign · Subject ·
            Client · Manager Status · Archive · Delete
            (then Clear, pinned right)
          It runs doer-facing edits first, then the manager's ruling, then the
          two destructive actions. Subject and Client are conditional on having
          any values to offer; when they're absent the rest keeps this order.
          Do not reshuffle these blocks — the sequence is the spec. */}
      {/* Brand accent rail — marks the bar as a live, armed control strip. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background:
            "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
        }}
      />
      <span className="inline-flex items-center gap-2 text-[14px] font-bold text-ink-strong">
        {pending && <Loader2 size={14} className="animate-spin text-altus-red" />}
        <span
          className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-white tabular-nums text-[12.5px] font-black"
          style={{
            background:
              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 3px 8px -3px rgba(225, 6, 0, 0.5)",
          }}
        >
          {count}
        </span>
        selected
      </span>

      <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />

      {/* Doer Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending} className={chipBtn}>
            <CheckCircle2 size={14} strokeWidth={2.2} />
            Doer Status
            <ChevronDown size={13} className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Set doer status to…</DropdownMenuLabel>
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

      {/* Manager Status — the terminal rulings, batched. Admin-only because
          `approval_status` is an admin column (the server re-checks), and
          grouped apart from the Doer Status dropdown above because these write
          a different column: Doer Status drives the worker's lifecycle, these
          record the ruling on it. */}
      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={pending} className={chipBtn}>
              <BadgeCheck size={14} strokeWidth={2.2} />
              Manager Status
              <ChevronDown size={13} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Mark selected as…</DropdownMenuLabel>
            {MANAGER_MARK_ACTIONS.map((a) => (
              <DropdownMenuItem
                key={`${a.kind}:${a.value}`}
                onSelect={() =>
                  run(a.verb, () =>
                    a.kind === "status"
                      ? bulkSetStatus(selectedIds, a.value)
                      : bulkSetApprovalStatus(selectedIds, a.value),
                  )
                }
              >
                {a.label}
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
            className="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-bold text-altus-red bg-surface-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-altus-red/8 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
            style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, transparent)" }}
          >
            <Trash2 size={14} strokeWidth={2.2} />
            Delete
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
      >
        <X size={14} strokeWidth={2.4} />
        Clear
      </button>
    </div>
  );
}

const chipBtn =
  "inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-altus-red hover:text-altus-red hover:bg-altus-red/[0.04] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40";
