"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";

// `g`-then-key navigation targets (Gmail-style leader sequence).
const GO_TO: Record<string, string> = {
  d: "/",
  t: "/tasks",
  m: "/tasks/agenda",
  p: "/projects",
  i: "/inbox",
};

const SEQUENCE_WINDOW_MS = 1500;

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(t.isContentEditable)
  );
}

/**
 * App-wide keyboard shortcuts. Mounted once in the (app) layout.
 *   ?            → toggle this help overlay
 *   G then D/T/M/P/I → navigate (Dashboard / Tasks / My Day / Projects / Inbox)
 * Coexists with the other context-owned shortcuts (⌘K palette, N new task,
 * J/K/Enter/F task-list nav) — those live with their components.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = React.useState(false);
  // Timestamp of the last bare `g` press — a ref so the listener stays stable
  // and never reads a stale value.
  const gAt = React.useRef(0);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While the help overlay is open, Esc just closes it (Radix also handles
      // this, but we guard so the keypress doesn't leak into navigation).
      if (helpOpen) {
        if (e.key === "Escape") setHelpOpen(false);
        return;
      }
      if (isTypingTarget(e.target)) return;

      // Second key of a `g …` sequence.
      if (gAt.current && Date.now() - gAt.current < SEQUENCE_WINDOW_MS) {
        gAt.current = 0;
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const dest = GO_TO[e.key.toLowerCase()];
          if (dest) {
            e.preventDefault();
            router.push(dest as Route);
            return;
          }
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "g" || e.key === "G") {
        gAt.current = Date.now();
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, helpOpen]);

  return (
    <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[95] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card shadow-xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 64px)" }}
        >
          <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-hairline">
            <Dialog.Title className="text-display-2xs text-ink-strong">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-full border border-hairline text-ink-muted hover:bg-surface-soft transition-colors"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>
          <div
            className="px-6 py-5 overflow-y-auto grid gap-6"
            style={{ maxHeight: "calc(100vh - 180px)" }}
          >
            {SHORTCUT_GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="text-table-head mb-2.5">{g.title}</h3>
                <div className="grid gap-1.5">
                  {g.rows.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <span className="text-[15px] text-ink-strong">{s.description}</span>
                      <span className="inline-flex gap-1.5 shrink-0">
                        {s.keys.map((k, ki) => (
                          <Kbd key={ki}>{k}</Kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center font-mono"
      style={{
        minWidth: 26,
        height: 24,
        padding: "0 8px",
        fontSize: 12.5,
        fontWeight: 700,
        color: "var(--color-ink-strong)",
        background: "rgba(15,23,42,0.06)",
        border: "1px solid rgba(15,23,42,0.14)",
        borderRadius: 6,
        boxShadow: "0 1px 0 rgba(15,23,42,0.08)",
      }}
    >
      {children}
    </kbd>
  );
}
