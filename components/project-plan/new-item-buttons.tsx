"use client";

import * as React from "react";
import { Plus, Upload } from "lucide-react";
import { KIND_LABEL, type PlanKind } from "@/lib/project-plan/levels";

/**
 * The CREATE boxes — Project · Milestone · Result · Action · Sub-Action — and
 * the Bulk Upload button beside them.
 *
 * ONE component, used by both Project surfaces: the register's toolbar and the
 * hierarchy board's search row. They were always going to be the same buttons
 * obeying the same rule, and two copies would have drifted the first time a
 * level was added.
 *
 * WHY FIVE AND NOT SIX. Every level with a SHORTCUT gets a box, and the
 * shortcuts are P · M · R · T · S. A Sub-Sub-Action is the one level with
 * neither: it is a sub-division of one particular sub-action, added from that
 * row on the board where the parent is already unambiguous, and a sixth box
 * would be a level nobody adds from a toolbar.
 *
 * Sub-Action USED to be in that same "added from its row" group, and is not any
 * more, because the toolbar now knows where it goes: the create dialog seeds
 * its parent pickers from the last-accessed branch (lib/project-plan/recent.ts),
 * so pressing S files the row under the action you were just in rather than
 * opening an empty chain of four pickers.
 *
 * NO PERMISSION GATE. Every level is open to any signed-in employee, matching
 * `createPlanNode`, which no longer tests who is asking. STATUS is the single
 * guarded action in this module (lib/project-plan/status.ts) — the working six
 * by the doer, their supervisor or the project owner; the five approval
 * verdicts only by the project owner or an admin. Creating a row is not a
 * verdict about anyone's work, so it is not gated.
 */

/** The levels the toolbar offers a button for, outermost first. */
export const CREATABLE_KINDS: PlanKind[] = [
  "project",
  "milestone",
  "result",
  "action",
  "sub_action",
];

/**
 * The single key that opens each level's create dialog, shown as a keycap in
 * the corner of its box.
 *
 * T FOR ACTION, not A. The five levels are P · M · R · A · S on paper, but A
 * and S are the two letters a table like this cannot have: A is Select-All in
 * every list on earth and S is Save. T — for Task, which is exactly what an
 * Action becomes — leaves Action reachable by one key without teaching people
 * that Ctrl-less A does something surprising here. S keeps Sub-Action because
 * nothing in this module binds a bare S.
 */
export const KIND_SHORTCUT: Partial<Record<PlanKind, string>> = {
  project: "P",
  milestone: "M",
  result: "R",
  action: "T",
  sub_action: "S",
};

/** "P" → "project". Built once from the table above, so the two cannot drift. */
const BY_KEY: Record<string, PlanKind> = Object.fromEntries(
  Object.entries(KIND_SHORTCUT).map(([kind, key]) => [key!, kind as PlanKind]),
);

/**
 * Should a bare letter press be treated as a shortcut right now?
 *
 * The whole risk of single-key shortcuts is typing "Project review" into the
 * search box and opening five dialogs. So: nothing while any field has focus,
 * nothing while a modal is open (Radix marks its content `[data-state="open"]`
 * and the bulk dialog does the same), and nothing with a modifier held, which
 * belongs to the browser.
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
  // A row's inline editor, the bulk preview, any dialog — all of them own the
  // keyboard while they are up.
  return Boolean(el.closest('[role="dialog"], [contenteditable="true"]'));
}

/**
 * P · M · R · T · S open the matching create dialog.
 *
 * `enabled` is the caller's own "nothing of mine is open" — the board passes
 * false while its detail, edit or bulk dialogs are up. The DOM check above
 * catches everything else, including dialogs this component knows nothing about.
 */
export function usePlanCreateShortcuts(onPick: (kind: PlanKind) => void, enabled = true): void {
  // The handler is held in a ref so the listener is bound once and not
  // re-bound on every render of the toolbar around it.
  const pick = React.useRef(onPick);
  React.useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const kind = BY_KEY[e.key.toUpperCase()];
      if (!kind) return;
      e.preventDefault();
      pick.current(kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export function NewItemButtons({
  onPick,
  onBulkUpload,
  bulkKind = "action",
  className = "",
}: {
  /** Called with the level to open the create dialog on. */
  onPick: (kind: PlanKind) => void;
  /** Called with the level to open the BULK dialog on — omit to hide it. */
  onBulkUpload?: (kind: PlanKind) => void;
  /** Which level Bulk Upload opens on. Each register passes the level it
   *  lists; the hierarchy board has no single level, so it takes the default. */
  bulkKind?: PlanKind;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {CREATABLE_KINDS.map((k) => {
        const key = KIND_SHORTCUT[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            title={key ? `New ${KIND_LABEL[k]} — press ${key}` : `New ${KIND_LABEL[k]}`}
            // `relative` + the wider right padding is what gives the keycap a
            // corner to sit INSIDE without it landing on the label. Inside
            // rather than hanging off the edge: these buttons wrap on a narrow
            // toolbar, and a badge outside the box overlaps the row above it.
            className="relative inline-flex items-center gap-1 rounded-xl border border-hairline-strong bg-white py-2 pl-2.5 pr-5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
          >
            {/* The shortcut letter, top-right, ahead of the + — a keycap, so it
                reads as "press this" rather than as part of the level's name. */}
            {key && (
              <kbd
                aria-hidden
                className="pointer-events-none absolute right-[3px] top-[3px] grid size-[14px] place-items-center rounded-[4px] border border-hairline bg-surface-soft text-[9px] font-black leading-none text-ink-subtle"
                style={{ fontFamily: "inherit" }}
              >
                {key}
              </kbd>
            )}
            <Plus size={13} strokeWidth={2.6} aria-hidden />
            {KIND_LABEL[k]}
          </button>
        );
      })}

      {/* BULK UPLOAD opens on whichever level makes sense where it is pressed —
          the register's own level, or Action on the board, which is the level
          people import fifty of. Every other level is one change of the
          dialog's own Level select away, so this is a starting point rather
          than five more buttons. */}
      {onBulkUpload && (
        <button
          type="button"
          onClick={() => onBulkUpload(bulkKind)}
          title="Bulk upload milestones, results, actions or sub-actions"
          className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          <Upload size={13} strokeWidth={2.6} aria-hidden />
          Bulk Upload
        </button>
      )}
    </div>
  );
}
