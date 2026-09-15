"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X, Loader2 } from "lucide-react";
import { workspaceForPath } from "@/lib/workspaces";

/* The importer is the heaviest thing in this dialog (motion, the column
   manifest, the preview table) and almost nobody opens it on any given page
   load. Loading it on demand keeps it out of the chrome bundle that EVERY
   screen in every module pays for — the button itself is an icon and a
   pathname check. `ssr:false` because it is a file dropzone: there is nothing
   for the server to render. */
const TaskImport = dynamic(
  () => import("@/components/tasks/task-import").then((m) => m.TaskImport),
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center py-20">
        <Loader2 className="animate-spin" size={28} style={{ color: "var(--color-altus-red)" }} />
      </div>
    ),
  },
);

/**
 * "Bulk Add" — the top bar's WMS-only bulk task upload, sitting between global
 * search and the red +.
 *
 * WHAT IT IS FOR, precisely: the user already has the spreadsheet on their
 * machine. Open this, drop the file, review what parsed, import. The blank
 * workbook to fill in is one button away in the SAME window (TaskImport's
 * "Download Template", which serves /tasks/template.xlsx) — asking someone to
 * go find the template on another page before they can use the uploader is the
 * round trip this button exists to remove.
 *
 * WMS ONLY. Bulk-importing rows means importing TASKS, and tasks are a WMS
 * concept — there is nothing for this to add in HR, Accounts or Goals, each of
 * which owns its own importer where it needs one. The gate lives HERE rather
 * than at the call sites because one of those call sites is the phone bar
 * inside DashboardSidebar, a server component that renders ONCE for the whole
 * shell: anything derived from the path up there freezes after the first soft
 * navigation (see the bug #24 note in that file). `usePathname` re-reads on
 * every navigation, so the button appears and disappears with the room.
 *
 * A NON-RED BUTTON, deliberately matched to the notification bell rather than
 * to the +. Red in this app marks the ONE primary action in a cluster, and that
 * is creating a task. Two red buttons side by side would make the user choose
 * between them at a glance; bulk upload is the occasional path, so it reads as
 * chrome and lets the + keep the emphasis.
 *
 * There is a second, older way into bulk entry — New Task › Import, which opens
 * a spreadsheet-style GRID with this same uploader underneath it. That one is
 * for typing or pasting rows by hand. This one goes straight to the file.
 */
export function BulkAddQuickAction({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);

  if (workspaceForPath(pathname) !== "wms") return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Bulk add tasks"
          title="Bulk Add — upload tasks from an Excel or CSV file"
          // The bell's exact square, so the cluster reads as one row of chrome
          // controls with a single red action in it.
          className={
            "relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg " +
            "border border-hairline-strong bg-surface-card text-ink-soft transition-colors " +
            "hover:bg-surface-soft hover:text-ink-strong " +
            className
          }
        >
          <Upload size={17} strokeWidth={2.3} aria-hidden />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        {/* Same shell as the New Task / Bulk Add Tasks modals — brand rule,
            gradient header, 44px close — so this is recognisably the same
            family of window rather than a third look. */}
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(1240px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 wms-card rounded-section bg-surface-card shadow-xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 48px)" }}
        >
          <div
            className="relative px-8 py-6 max-md:px-5 max-md:py-5"
            style={{
              borderBottom: "1px solid var(--color-hairline)",
              background: "linear-gradient(135deg, #ffffff 0%, #FFF5F5 100%)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0"
              style={{ height: 5, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }}
            />
            <Dialog.Title
              className="text-ink-strong inline-flex items-center gap-2.5"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(26px, 2.6vw, 36px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              <Upload size={26} strokeWidth={2.4} style={{ color: "var(--color-altus-red)" }} />
              Bulk Add
            </Dialog.Title>
            <Dialog.Description
              className="mt-1 font-semibold"
              style={{ fontSize: 14.5, color: "var(--color-ink-muted)" }}
            >
              {/* TaskImport's own line below already says "upload a CSV or Excel
                  file, each row becomes one task" — this one orients, it does
                  not restate it. */}
              Add many tasks at once from a spreadsheet — yours, or the blank
              template below.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute top-5 right-5 inline-flex items-center justify-center rounded-full transition-all hover:bg-surface-soft"
                style={{
                  width: 44,
                  height: 44,
                  border: "1px solid var(--color-hairline)",
                  background: "#ffffff",
                  color: "var(--color-ink-muted)",
                }}
              >
                <X size={22} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div
            className="px-8 py-6 max-md:px-5 max-md:py-5"
            style={{ maxHeight: "calc(100vh - 190px)", overflowY: "auto" }}
          >
            {/* `embedded` drops TaskImport's own page hero and back-link (the
                dialog header above says all of it) but KEEPS the Download
                Template button, which is the half of this window the user does
                not already have on their machine. */}
            <TaskImport embedded onSuccess={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
