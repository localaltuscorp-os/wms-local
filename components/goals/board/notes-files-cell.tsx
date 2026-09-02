"use client";

/**
 * Notes & Attachments — the simplified table's two separate columns (they
 * used to be one combined "Notes & Files" cell; split so each column reads
 * as exactly what it says). Both trigger the SAME expand toggle (the full
 * Notes + Attachments editor lives in the row's expanded detail panel) —
 * clicking either column opens it.
 *
 * Uses the lightweight `listGoalAttachments` action (not the full
 * goalDetailBundle) since the Attachments cell only ever needs the file
 * gallery, not the whole detail bundle.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Eye, FileText, Loader2, Paperclip, X } from "lucide-react";
import { listGoalAttachments, removeGoalAttachment, type DetailAttachment } from "@/app/(app)/goals/cascade/detail-actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

export interface NotesFilesCellProps {
  goalId: string;
  hasNotes: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/** Notes column — the expand toggle, shown only when a note actually exists
 *  (an empty goal edits its notes via the goal edit dialog instead), colored
 *  solid red to flag "this goal has a note" at a glance. */
export function NotesCell({ goalId, hasNotes, expanded, onToggle }: NotesFilesCellProps) {
  if (!hasNotes) {
    return (
      <span className="block w-full text-left text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
        —
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-notes-toggle={goalId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.03em] text-white transition-colors hover:bg-altus-red-deep",
        FOCUS_RING,
      )}
      style={{
        borderColor: "var(--color-altus-red-deep)",
        background: "var(--color-altus-red)",
      }}
    >
      <ChevronDown size={10} strokeWidth={2.6} className={cn("transition-transform", expanded && "rotate-180")} />
      Notes
    </button>
  );
}

/** Attachments column — the file gallery preview, visible without expanding.
 *  Capped to the first file + a "+N" overflow chip so a goal with several
 *  attachments never stretches the row's height. Hovering the chip pops up
 *  a small card listing every attached file with a one-click "View" (opens
 *  in a new tab) — no need to expand the row just to open a file. Clicking
 *  the chip itself still opens the expanded row (upload / remove live there).
 */
export function AttachmentsCell({ goalId, expanded, onToggle }: { goalId: string; expanded: boolean; onToggle: () => void }) {
  const [atts, setAtts] = React.useState<DetailAttachment[] | null>(null); // null = loading
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    listGoalAttachments({ id: goalId, kind: "cascade" }).then((res) => {
      if (live) setAtts(res.ok ? res.attachments : []);
    });
    return () => {
      live = false;
    };
  }, [goalId]);

  async function remove(a: DetailAttachment) {
    if (removingId) return;
    setRemovingId(a.id);
    const res = await removeGoalAttachment({ id: a.id });
    setRemovingId(null);
    if (!res.ok) {
      fireToast({ message: res.error ?? "Couldn't remove file", type: "error" });
      return;
    }
    setAtts((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
  }

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = () => {
    if (!atts) return; // still loading — nothing to preview yet
    cancelHide();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    setPos({ left: Math.min(Math.max(12, r.left), vw - 300), top: r.bottom + 6 });
  };
  // Small delay so moving the cursor from the chip into the popover itself
  // (to click "View") doesn't slam it shut mid-move.
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPos(null), 150);
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 text-left", FOCUS_RING)}
      >
        {atts && atts.length > 0 ? (
          <Paperclip size={14} className="shrink-0 text-altus-red-deep" aria-label={`${atts.length} attached file${atts.length === 1 ? "" : "s"} — hover to view`} />
        ) : atts && atts.length === 0 ? (
          <Paperclip size={14} className="shrink-0 text-ink-subtle" aria-label="No files attached" />
        ) : (
          <span className="text-[10.5px] text-ink-subtle">…</span>
        )}
      </button>

      {pos &&
        atts &&
        createPortal(
          <div
            role="dialog"
            aria-label="Attached files"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              zIndex: 10000,
              width: 280,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 12,
              boxShadow: "0 14px 34px -10px rgba(15,23,42,0.35)",
              padding: 6,
            }}
          >
            {atts.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {atts.map((a) => (
                  <li key={a.id} className="flex items-center gap-1 rounded-lg transition-colors hover:bg-surface-soft">
                    <a
                      href={a.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View ${a.title}`}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                        !a.url && "pointer-events-none opacity-50",
                        FOCUS_RING,
                      )}
                    >
                      <FileText size={13} className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong" title={a.title}>
                        {a.title}
                      </span>
                      <Eye size={13} className="shrink-0 text-altus-red-deep" />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={removingId === a.id}
                      aria-label={`Remove ${a.title}`}
                      title="Remove attachment"
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_15%,transparent)] hover:text-altus-red disabled:opacity-50",
                        FOCUS_RING,
                      )}
                    >
                      {removingId === a.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <X size={12} strokeWidth={2.6} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] font-medium text-ink-subtle">
                <Paperclip size={13} className="shrink-0" />
                No file uploaded
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
