"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload, Loader2 } from "lucide-react";
import { NewTaskForm } from "./new-task-form";
import { TasksBulkEntry } from "./tasks-bulk-entry";
import { loadNewTaskOptions } from "@/app/(app)/tasks/actions";

interface Props {
  /** Optional defaults — usually pre-fill initiator = current user. */
  defaultInitiatorId?: string;
  /** Admins get the "Import" shortcut in the dialog header. */
  isAdmin?: boolean;
}

type Options = {
  employees: { id: string; name: string }[];
  clients: string[];
  subjects: string[];
  projectNodes: { id: string; label: string }[];
  /** Admin-only: may create a new client/subject from the pickers. */
  canAddRoster: boolean;
};

/** Window event any out-of-tree trigger can fire to open this dialog.
 *  See the listener below for why remote triggers dispatch instead of
 *  rendering their own copy. */
export const NEW_TASK_OPEN_EVENT = "wms:open-new-task";

export function NewTaskDialog({ defaultInitiatorId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Lazily-loaded option rosters, held in STABLE client state. Fetched the
  // first time the dialog opens (and refreshed in the background on later
  // opens), so the modal's data never gets a new identity from the global
  // `router.refresh()` cycle — the form is fully insulated from realtime
  // re-renders, and the 4 roster queries no longer run on every page render.
  const [opts, setOpts] = useState<Options | null>(null);
  const [optsError, setOptsError] = useState<string | null>(null);

  const ensureOptions = useCallback(() => {
    setOptsError(null);
    loadNewTaskOptions()
      .then(setOpts)
      .catch(() => setOptsError("Couldn't load the form. Close and reopen to retry."));
  }, []);

  // Load (and on later opens, refresh) the rosters when the dialog opens. The
  // last-loaded `opts` stays visible while a refresh is in flight, so reopen is
  // instant and the form never sees a churning identity.
  useEffect(() => {
    if (open || importOpen) ensureOptions();
  }, [open, importOpen, ensureOptions]);

  // Open the Import popup instead of navigating to a page (the page round-trip
  // hit the remote DB and felt slow). Close New Task first so the two dialogs
  // never stack.
  function goImport() {
    setOpen(false);
    setImportOpen(true);
  }

  // Keyboard shortcut: pressing "N" (no modifier) opens the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (open) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore when typing in form fields.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Remote open, for triggers that live outside this component's tree — the
  // compact New Task button up in the sidebar's top control row.
  //
  // It dispatches an event instead of rendering its own <NewTaskDialog>: this
  // component owns local `open` state AND a window-level "N" listener, so a
  // second instance would stack two modals and open both on one keypress.
  // One dialog, many triggers.
  useEffect(() => {
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener(NEW_TASK_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(NEW_TASK_OPEN_EVENT, onOpenRequest);
  }, []);

  function onSuccess(taskId: string) {
    setOpen(false);
    router.push(`/tasks/${taskId}` as Route);
  }

  return (
    <>
    <Dialog.Root open={open} onOpenChange={setOpen}>

      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(1200px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 wms-card rounded-section bg-surface-card shadow-xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => document.getElementById("nt-title")?.focus());
          }}
        >
          {/* Header — brand bar + title */}
          <div
            className="relative px-8 py-5 max-md:px-5 max-md:py-4"
            style={{
              borderBottom: "1px solid var(--color-hairline)",
              background:
                "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0"
              style={{
                height: 4,
                background:
                  "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))",
              }}
            />
            <Dialog.Title
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(26px, 2.6vw, 34px)",
                letterSpacing: "-0.022em",
                lineHeight: 1.02,
              }}
            >
              New Task
            </Dialog.Title>
            <Dialog.Description
              className="mt-1 font-semibold"
              style={{
                fontSize: 15,
                color: "var(--color-ink-muted)",
              }}
            >
              Capture work, attach context, assign owners — all in one go.
            </Dialog.Description>
            {/* Top-right actions — Import shortcut (all users) + Close. */}
            <div className="absolute top-4 right-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={goImport}
                title="Bulk-import tasks from CSV or Excel"
                className="inline-flex items-center gap-2 rounded-full px-4 h-10 text-[14px] font-semibold transition-colors hover:bg-surface-soft max-md:px-3"
                style={{
                  border: "1px solid var(--color-hairline)",
                  background: "#ffffff",
                  color: "var(--color-ink-strong)",
                }}
              >
                <Upload size={17} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                <span className="max-md:hidden">Import</span>
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex items-center justify-center rounded-full transition-all hover:bg-surface-soft"
                  style={{
                    width: 40,
                    height: 40,
                    border: "1px solid var(--color-hairline)",
                    background: "#ffffff",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  <X size={20} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Scrollable body — fills the rectangle. py-4 rather than py-6: the
              header already carries its own py-5 above the hairline, so 24px of
              body padding on top of it read as a gap rather than a margin. */}
          <div
            className="px-8 py-4 max-md:px-5 max-md:py-4"
            style={{
              maxHeight: "calc(100vh - 200px)",
              overflowY: "auto",
            }}
          >
            {opts ? (
              <NewTaskForm
                employees={opts.employees}
                clients={opts.clients}
                subjects={opts.subjects}
                projectNodes={opts.projectNodes}
                canAddRoster={opts.canAddRoster}
                onSuccess={onSuccess}
                defaults={{ initiatorId: defaultInitiatorId }}
              />
            ) : optsError ? (
              <div className="grid place-items-center py-16 text-center">
                <p className="text-[15px] font-semibold text-ink-muted">{optsError}</p>
              </div>
            ) : (
              <div className="grid place-items-center py-20">
                <Loader2 className="animate-spin" size={28} style={{ color: "var(--color-altus-red)" }} />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    {/* Import popup (all users) — opens in place instead of navigating to a page. */}
    {(
      <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          />
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
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.6vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
              >
                <Upload size={26} strokeWidth={2.4} style={{ color: "var(--color-altus-red)" }} />
                Bulk Add Tasks
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-semibold" style={{ fontSize: 14.5, color: "var(--color-ink-muted)" }}>
                Fill the grid (or paste from Excel), review duplicates &amp; anomalies, then create — or import a file.
              </Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute top-5 right-5 inline-flex items-center justify-center rounded-full transition-all hover:bg-surface-soft"
                  style={{ width: 44, height: 44, border: "1px solid var(--color-hairline)", background: "#ffffff", color: "var(--color-ink-muted)" }}
                >
                  <X size={22} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
            <div className="px-8 py-6 max-md:px-5 max-md:py-5" style={{ maxHeight: "calc(100vh - 190px)", overflowY: "auto" }}>
              {opts ? (
                <TasksBulkEntry
                  roster={opts.employees}
                  clients={opts.clients}
                  subjects={opts.subjects}
                  me={opts.employees.find((e) => e.id === defaultInitiatorId) ?? null}
                  onSuccess={() => setImportOpen(false)}
                />
              ) : optsError ? (
                <div className="grid place-items-center py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">{optsError}</p>
                </div>
              ) : (
                <div className="grid place-items-center py-20">
                  <Loader2 className="animate-spin" size={28} style={{ color: "var(--color-altus-red)" }} />
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )}
    </>
  );
}
