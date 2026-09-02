"use client";

import { useEffect, useState, useCallback } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Plus } from "lucide-react";
import { NEW_TASK_OPEN_EVENT } from "./new-task-dialog";

const HINT_STORAGE_KEY = "vp_seen_new_task_hint";

/**
 * The left rail's full-width "New Task" button, plus the first-run hint balloon
 * that points at it.
 *
 * This used to be part of <NewTaskDialog>, which is why the dialog could only
 * exist where this button existed — inside the sidebar, and only on WMS routes
 * (SidebarNewTask returns null everywhere else). A global "+" in the app header
 * therefore had nothing to talk to outside WMS: it rendered on every route and
 * silently did nothing on most of them.
 *
 * Splitting them lets exactly ONE headless <NewTaskDialog> mount at the (app)
 * layout root, where every route can reach it, while this button stays a
 * WMS-only piece of rail furniture. It opens the modal the same way every other
 * out-of-tree trigger does — by dispatching NEW_TASK_OPEN_EVENT.
 */
export function NewTaskRailButton() {
  const [showHint, setShowHint] = useState(false);

  // First-time hint: surface if the user has never seen it before.
  // Dismisses on open, on explicit close, or after 10s.
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

  return (
      <div className="relative">
        <Tooltip.Provider delayDuration={600}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              {/* Sized to the exact box the rail's old "Back to Hub" pill used:
                  w-full · justify-center · rounded-2xl · px-4 py-2.5. That pill
                  is gone (the brand block links to /hub now), so New Task is the
                  rail's single full-width action. */}
                <button
                  type="button"
                  onClick={() => {
                    dismissHint();
                    window.dispatchEvent(new Event(NEW_TASK_OPEN_EVENT));
                  }}
                  className="group relative inline-flex w-full items-center justify-center gap-2 rounded-2xl text-white font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/60 px-4 py-2.5 max-md:gap-0 max-md:size-10 max-md:p-0 max-md:justify-center"
                  style={{
                    fontSize: 14,
                    letterSpacing: "0.005em",
                    background:
                      "linear-gradient(135deg, rgb(212, 6, 0), rgb(160, 4, 0))",
                    boxShadow:
                      "0 2px 6px rgba(120, 3, 0, 0.20), inset 0 0 0 1px rgba(255,255,255,0.16)",
                    transition:
                      "transform 180ms ease, box-shadow 220ms ease, filter 180ms ease",
                    animation:
                      "newTaskIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
                    willChange: "transform",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.02)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(120, 3, 0, 0.28), inset 0 0 0 1px rgba(255,255,255,0.22)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "";
                    e.currentTarget.style.boxShadow =
                      "0 2px 6px rgba(120, 3, 0, 0.20), inset 0 0 0 1px rgba(255,255,255,0.16)";
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
                "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)",
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
                  "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)",
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
  );
}
