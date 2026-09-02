"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  archiveTask,
  unarchiveTask,
  setTaskStatus,
  setTaskPriority,
  reassignDoer,
  deleteTask,
} from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from "@/db/enums";
import type { TaskListRow } from "@/lib/types";
import {
  canApprove,
  canReassign,
} from "@/lib/auth/task-permissions";

interface Props {
  row: TaskListRow;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
}

const STATUS_ACTIONS: { value: TaskStatus; label: string }[] = [
  { value: "done",         label: "Mark Done" },
  { value: "approved",     label: "Mark Approved" },
  { value: "not_approved", label: "Mark Not Approved" },
  { value: "cancelled",    label: "Mark Cancelled" },
];

export function TaskRowActions({ row, employees, me }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // Result shape every mutating action now returns. `void` is tolerated for
  // any legacy callsite. On failure we toast the reason and skip the success
  // toast — the user keeps their place instead of hitting an error screen.
  type ActionResult =
    | { ok: true }
    | { ok: false; error?: string; message?: string }
    | void;

  function friendlyError(res: { error?: string; message?: string }): string {
    if (res.message) return res.message;
    switch (res.error) {
      case "forbidden":
        return "You're not allowed to make that change.";
      case "stale":
        return "This task changed elsewhere — refreshing.";
      case "not-found":
        return "That task no longer exists.";
      default:
        return res.error ?? "Something went wrong — please try again.";
    }
  }

  function withTransition(label: string, fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await fn();
      } catch {
        fireToast({ message: "Something went wrong — please try again." });
        return;
      }
      if (res && res.ok === false) {
        fireToast({ message: friendlyError(res) });
        if (res.error === "stale") router.refresh();
        return;
      }
      router.refresh();
      fireToast({ message: label });
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({
        message: "Task archived.",
        actionLabel: "Undo",
        action: () => {
          void unarchiveTask(row.id);
        },
      });
    });
  }

  function handleUnarchive() {
    startTransition(async () => {
      const res = await unarchiveTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({
        message: "Task restored.",
        actionLabel: "Undo",
        action: () => {
          void archiveTask(row.id);
        },
      });
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Permanently delete "${row.title}"?\n\nThis removes the task and its history and cannot be undone. Use Archive or Cancel instead if you just want to hide it.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({ message: "Task deleted." });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${row.title}`}
          className="size-9 inline-flex items-center justify-center rounded-full hover:bg-surface-soft text-ink-subtle hover:text-ink-strong transition-colors disabled:opacity-50"
          disabled={isPending}
        >
          <MoreHorizontal size={18} strokeWidth={2.2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* Archive / Unarchive — admin-only (doers change status instead; a
            doer archiving a task effectively hid it from the board). */}
        {me.isAdmin && (
          <>
            {row.archived ? (
              <DropdownMenuItem onClick={handleUnarchive}>
                <ArchiveRestore size={14} />
                Unarchive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleArchive}>
                <Archive size={14} />
                Archive
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
          </>
        )}

        {STATUS_ACTIONS.map((s) => (
          <DropdownMenuItem
            key={s.value}
            disabled={row.status === s.value}
            onClick={() =>
              withTransition(`Status set to ${s.label.replace("Mark ", "")}.`, () =>
                setTaskStatus(row.id, s.value, row.updatedAt.toISOString()),
              )
            }
          >
            {s.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change Priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Eisenhower priority</DropdownMenuLabel>
            {TASK_PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p}
                disabled={row.priority === p}
                danger={p === "imp_urgent"}
                onClick={() =>
                  withTransition(`Priority set to ${PRIORITY_LABELS[p]}.`, () =>
                    setTaskPriority(row.id, p as TaskPriority),
                  )
                }
              >
                {PRIORITY_LABELS[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Reassign Doer</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Employees</DropdownMenuLabel>
            {employees.map((e) => (
              <DropdownMenuItem
                key={e.id}
                disabled={e.id === row.doerId}
                onClick={() =>
                  withTransition(`Doer reassigned to ${e.name}.`, () =>
                    reassignDoer(row.id, e.id),
                  )
                }
              >
                {e.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {(() => {
          const permInput = {
            employee: { id: me.id, isAdmin: me.isAdmin },
            task: {
              createdById: row.createdById,
              initiatorId: row.initiatorId,
              doerId: row.doerId,
              status: row.status,
            },
          };
          const items: Array<{ label: string; href: string }> = [];
          if (canApprove({ ...permInput, isDoersManager: false }))
            items.push({ label: "Approve / Decline…", href: `/tasks/${row.id}#approve` });
          if (canReassign(permInput))
            items.push({ label: "Reassign…", href: `/tasks/${row.id}#reassign` });
          if (items.length === 0) return null;
          return (
            <>
              <DropdownMenuSeparator />
              {items.map((it) => (
                <DropdownMenuItem key={it.label} asChild>
                  <Link href={it.href as Route}>{it.label}</Link>
                </DropdownMenuItem>
              ))}
            </>
          );
        })()}

        {/* Permanent delete — destructive, so admin-only + confirmed. Lives
            at the very bottom, highlighted red. */}
        {me.isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onClick={handleDelete}>
              <Trash2 size={14} />
              Delete task…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
