"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Plus, X, Upload } from "lucide-react";
import { NewTaskForm } from "./new-task-form";
import { TaskImport } from "./task-import";

interface Props {
  employees: { id: string; name: string }[];
  /** Client roster for the "Client Name" picker. */
  clients: string[];
  /** Subject roster for the "Subject" picker. */
  subjects: string[];
  /** Project tree nodes for the optional Project link. */
  projectNodes?: { id: string; label: string }[];
  /** Optional defaults — usually pre-fill initiator = current user. */
  defaultInitiatorId?: string;
  /** Admins get the "Import" shortcut in the dialog header. */
  isAdmin?: boolean;
}

const HINT_STORAGE_KEY = "vp_seen_new_task_hint";

export function NewTaskDialog({ employees, clients, subjects, projectNodes, defaultInitiatorId, isAdmin }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Open the Import popup instead of navigating to a page (the page round-trip
  // hit the remote DB and felt slow). Close New Task first so the two dialogs
  // never stack.
  function goImport() {
    setOpen(false);
    setImportOpen(true);
  }

  // First-time hint: surface if the user has never seen it before.
  // Dismisses on dialog open, on explicit close, or after 10s.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(HINT_STORAGE_KEY);
      if (!seen) {
        // Delay a beat so the entry animation reads cleanly before the hint pops.
        const t = window.setTimeout(() => setShowHint(true), 700);
        return () => window.clearTimeout(t);
      }
    } catch {
      // localStorage may be unavailable — silently skip the hint.
    }
  }, []);

  const dismissHint = useCallback(() => {
    if (!showHint) return;
    setShowHint(false);
    try {
      window.localStorage.setItem(HINT_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [showHint]);

  // Auto-dismiss after 10s.
  useEffect(() => {
    if (!showHint) return;
    const t = window.setTimeout(dismissHint, 10000);
    return () => window.clearTimeout(t);
  }, [showHint, dismissHint]);

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

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) dismissHint();
  }

  function onSuccess(taskId: string) {
    setOpen(false);
    dismissHint();
    router.push(`/tasks/${taskId}` as Route);
  }

  return (
    <>
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <div className="relative">
        <Tooltip.Provider delayDuration={600}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="group relative inline-flex items-center gap-2 rounded-full text-white font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/60 py-2 pr-3.5 pl-3 max-md:gap-0 max-md:size-10 max-md:p-0 max-md:justify-center"
                  style={{
                    fontSize: 14,
                    letterSpacing: "0.005em",
                    background:
                      "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
                    boxShadow:
                      "0 4px 14px rgba(225, 6, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.22)",
                    transition:
                      "transform 180ms ease, box-shadow 220ms ease, filter 180ms ease",
                    animation:
                      "newTaskIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
                    willChange: "transform",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.04)";
                    e.currentTarget.style.boxShadow =
                      "0 10px 28px rgba(225, 6, 0, 0.6), 0 0 0 6px rgba(225, 6, 0, 0.14), inset 0 0 0 1px rgba(255,255,255,0.32)";
                    e.currentTarget.style.filter = "brightness(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "";
                    e.currentTarget.style.boxShadow =
                      "0 4px 14px rgba(225, 6, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.22)";
                    e.currentTarget.style.filter = "";
                  }}
                >
                  <Plus size={15} strokeWidth={2.6} />
                  <span className="max-md:sr-only">New Task</span>
                  <kbd
                    aria-hidden
                    className="ml-1 inline-flex items-center justify-center font-mono max-md:hidden"
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      borderRadius: 5,
                      color: "rgba(255,255,255,0.95)",
                      background: "rgba(255,255,255,0.18)",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
                      letterSpacing: 0,
                    }}
                  >
                    N
                  </kbd>
                </button>
              </Dialog.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="bottom"
                sideOffset={10}
                className="z-[80] rounded-md px-3 py-2 text-[13px] shadow-lg"
                style={{
                  background: "#0F172A",
                  color: "#ffffff",
                  animation: "userMenuIn 140ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                Create a new task <span style={{ opacity: 0.7 }}>· press N</span>
                <Tooltip.Arrow style={{ fill: "#0F172A" }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {showHint && (
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Dismiss hint"
            className="absolute right-0 top-full mt-3 z-40 text-left"
            style={{
              minWidth: 240,
              maxWidth: 280,
              padding: "10px 12px",
              borderRadius: 12,
              background:
                "linear-gradient(135deg, #ffffff 0%, #F0FBFF 100%)",
              color: "#0F172A",
              boxShadow:
                "0 18px 36px -10px rgba(225, 6, 0, 0.38), 0 4px 12px rgba(15, 23, 42, 0.10)",
              border: "1px solid rgba(225, 6, 0, 0.22)",
              animation:
                "hintBalloonIn 360ms cubic-bezier(0.16, 1, 0.3, 1) both",
              fontSize: 14,
              lineHeight: 1.45,
              cursor: "pointer",
            }}
          >
            {/* Balloon arrow */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -6,
                right: 22,
                width: 12,
                height: 12,
                background:
                  "linear-gradient(135deg, #ffffff 0%, #F0FBFF 100%)",
                borderTop: "1px solid rgba(225, 6, 0, 0.22)",
                borderLeft: "1px solid rgba(225, 6, 0, 0.22)",
                transform: "rotate(45deg)",
              }}
            />
            <span className="block font-semibold" style={{ color: "#0F172A" }}>
              Start by creating your first task
              <span style={{ color: "rgb(168, 4, 0)" }}> →</span>
            </span>
            <span
              className="block mt-0.5"
              style={{ color: "#64748B", fontSize: 13 }}
            >
              Click here or press <kbd
                style={{
                  display: "inline-block",
                  padding: "0 4px",
                  borderRadius: 3,
                  background: "rgba(15, 23, 42, 0.08)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "#334155",
                }}
              >
                N
              </kbd> to begin.
            </span>
          </button>
        )}
      </div>

      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(1360px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card shadow-xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 48px)" }}
        >
          {/* Header — cyan brand bar + big title */}
          <div
            className="relative px-10 py-7 max-md:px-5 max-md:py-5"
            style={{
              borderBottom: "1px solid var(--color-hairline)",
              background:
                "linear-gradient(135deg, #ffffff 0%, #F0FBFF 100%)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0"
              style={{
                height: 5,
                background:
                  "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))",
              }}
            />
            <Dialog.Title
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(36px, 3.6vw, 52px)",
                letterSpacing: "-0.024em",
                lineHeight: 1.02,
              }}
            >
              New Task
            </Dialog.Title>
            <Dialog.Description
              className="mt-2 font-bold"
              style={{
                fontSize: 19,
                color: "var(--color-ink-muted)",
              }}
            >
              Capture work, attach context, assign owners — all in one go.
            </Dialog.Description>
            {/* Top-right actions — Import shortcut (admin) + Close. */}
            <div className="absolute top-6 right-6 flex items-center gap-2.5">
              {isAdmin && (
                <button
                  type="button"
                  onClick={goImport}
                  title="Bulk-import tasks from CSV or Excel"
                  className="inline-flex items-center gap-2 rounded-full px-4 h-12 text-[14px] font-semibold transition-colors hover:bg-surface-soft max-md:px-3"
                  style={{
                    border: "1px solid var(--color-hairline)",
                    background: "#ffffff",
                    color: "var(--color-ink-strong)",
                  }}
                >
                  <Upload size={17} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                  <span className="max-md:hidden">Import</span>
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex items-center justify-center rounded-full transition-all"
                  style={{
                    width: 48,
                    height: 48,
                    border: "1px solid var(--color-hairline)",
                    background: "#ffffff",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  <X size={24} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Scrollable body — fills the rectangle */}
          <div
            className="px-10 py-8 max-md:px-5 max-md:py-5"
            style={{
              maxHeight: "calc(100vh - 240px)",
              overflowY: "auto",
            }}
          >
            <NewTaskForm
              employees={employees}
              clients={clients}
              subjects={subjects}
              projectNodes={projectNodes}
              onSuccess={onSuccess}
              defaults={{ initiatorId: defaultInitiatorId }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    {/* Import popup (admin) — opens in place instead of navigating to a page. */}
    {isAdmin && (
      <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
          />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[70] w-[min(1100px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card shadow-xl overflow-hidden"
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
                Import tasks
              </Dialog.Title>
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
              <TaskImport embedded onSuccess={() => setImportOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )}
    </>
  );
}
