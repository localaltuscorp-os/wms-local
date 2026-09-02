"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Trash2,
  CheckCircle2,
  UserCog,
} from "lucide-react";
import {
  archiveTask,
  unarchiveTask,
  deleteTask,
} from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import type { TaskListRow } from "@/lib/types";
import {
  canApprove,
  canReassign,
} from "@/lib/auth/task-permissions";

interface Props {
  row: TaskListRow;
  /** Retained so existing call sites keep type-checking; the roster was only
   *  ever needed by the removed ⋯ menu's "Reassign Doer" submenu. Reassignment
   *  now happens in the row's own inline Doer dropdown. */
  employees?: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
}

export function TaskRowActions({ row, me }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // `withTransition` / `friendlyError` went with the ⋯ menu — archive, delete
  // and unarchive below each own their own result handling.

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

  // Row actions are a MANAGEMENT surface. Admins get the full power menu; a
  // task's initiator/reviewer keeps their permission-checked Approve/Reassign
  // links. A plain DOER (no admin, no rights over this task) gets NOTHING — the
  // ⋯ trigger is hidden entirely.
  const permInput = {
    employee: { id: me.id, isAdmin: me.isAdmin },
    task: {
      createdById: row.createdById,
      initiatorId: row.initiatorId,
      doerId: row.doerId,
      status: row.status,
    },
  };
  const showApproveLink = canApprove({ ...permInput, isDoersManager: false });
  const showReassignLink = canReassign(permInput);
  if (!me.isAdmin && !showApproveLink && !showReassignLink) return null;

  // Quick actions sit OUTSIDE the ⋯ menu as one-click icon buttons, so the two
  // things people reach for constantly (archive, delete) don't cost a menu
  // open. Same admin-only rule as before, and they're removed from the menu
  // below so each action has exactly one home.
  const quickBtn =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    // `task-quick-actions` is the hook globals.css uses to hold this cluster at
    // 60% until the pointer is on the row, then bring it to full opacity and a
    // slight scale. Styling it from the row's CSS rather than with `group-hover`
    // keeps it working inside the frozen Manage cell, which paints its own
    // background and sits in a separate stacking context.
    <div className="task-quick-actions inline-flex items-center gap-0.5">
      {/* ORDER: Delete first, then Archive (reversed 2026-08). */}
      {me.isAdmin && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          title={`Delete "${row.title}" permanently`}
          aria-label={`Delete ${row.title}`}
          className={`${quickBtn} text-red-500 hover:bg-red-50 hover:text-red-700`}
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}

      {me.isAdmin &&
        (row.archived ? (
          <button
            type="button"
            onClick={handleUnarchive}
            disabled={isPending}
            title={`Restore "${row.title}" from the archive`}
            aria-label={`Unarchive ${row.title}`}
            className={`${quickBtn} text-gray-500 hover:bg-gray-100 hover:text-gray-700`}
          >
            <ArchiveRestore size={15} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            title={`Archive "${row.title}"`}
            aria-label={`Archive ${row.title}`}
            className={`${quickBtn} text-gray-500 hover:bg-gray-100 hover:text-gray-700`}
          >
            <Archive size={15} strokeWidth={2.2} />
          </button>
        ))}

      {/* The ⋯ overflow menu was removed on request. Nothing was lost for
          admins: everything it held — set status, change priority, reassign
          doer — is now a one-click inline dropdown in the row's own Doer /
          Priority / Status columns, so the menu was a second, slower path to
          controls already sitting a few pixels away.

          For a non-admin initiator/reviewer it also carried Approve/Decline
          and Reassign deep-links. Those still exist on the record itself: the
          detail view opens the matching dialog off the `#approve` / `#reassign`
          hash, reachable by clicking the task. */}
      {(showApproveLink || showReassignLink) && !me.isAdmin && (
        <>
          {showApproveLink && (
            <Link
              href={`/tasks/${row.id}#approve` as Route}
              title={`Approve or decline "${row.title}"`}
              aria-label={`Approve or decline ${row.title}`}
              className={`${quickBtn} hover:bg-surface-soft hover:text-ink-strong`}
            >
              <CheckCircle2 size={15} strokeWidth={2.2} />
            </Link>
          )}
          {showReassignLink && (
            <Link
              href={`/tasks/${row.id}#reassign` as Route}
              title={`Reassign "${row.title}"`}
              aria-label={`Reassign ${row.title}`}
              className={`${quickBtn} hover:bg-surface-soft hover:text-ink-strong`}
            >
              <UserCog size={15} strokeWidth={2.2} />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
