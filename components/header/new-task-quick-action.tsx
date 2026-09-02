"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { NEW_TASK_OPEN_EVENT } from "@/components/tasks/new-task-dialog";

/**
 * The global "+ New Task" quick action, pinned in the top bar immediately left
 * of the notification bell.
 *
 * It dispatches the window event that <NewTaskDialog> listens for rather than
 * mounting a second copy of the dialog. That component owns the modal's open
 * state AND a global "N" keydown listener, so a second instance would stack two
 * modals and open both on one keypress — see the note on NEW_TASK_OPEN_EVENT.
 * Exactly one <NewTaskDialog> lives in the tree — mounted headless by the (app)
 * layout root, NOT by the sidebar — and every out-of-tree trigger talks to it
 * through this event. That mount point matters: while the dialog lived in the
 * sidebar it was gated to WMS routes (SidebarNewTask returns null elsewhere),
 * so this button rendered app-wide but silently did nothing outside WMS.
 *
 * This replaced a + that sat in the WMS dashboard's "Task Summary" section
 * header. That one was reachable only from a single section of a single page —
 * and it disappeared entirely when the summary was collapsed. Creating a task
 * is a global action, so it belongs in the persistent chrome.
 *
 * Rendered in BOTH bars: AppTopBar is `max-md:hidden`, so on phones this rides
 * in the sidebar's fixed 56px strip alongside the bell, which is the same split
 * the bell itself already uses.
 */
export function NewTaskQuickAction({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(NEW_TASK_OPEN_EVENT))}
      aria-label="New task"
      title="New task (N)"
      className={
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md p-1.5 " +
        "bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 " +
        className
      }
    >
      <Plus size={16} strokeWidth={2.8} aria-hidden />
    </button>
  );
}
