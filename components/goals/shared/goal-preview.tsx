"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { GoalDetails, GOAL_LEVEL_LABEL } from "./goal-details";

/**
 * GoalPreview — wrap any goal affordance to get the shared interaction:
 *
 *   hover / focus  → compact popover with the goal's TITLE + NOTES
 *   click / tap    → the full `GoalDetails` view
 *
 * One component for Yearly, Quarterly, Monthly and Weekly, so the behaviour
 * cannot diverge between boards. It renders no chrome of its own — the caller's
 * children stay exactly as they were, wrapped in a button for keyboard reach.
 *
 * CLIPPING: boards put rows inside `overflow-auto` table wrappers, so a popover
 * positioned in normal flow would be cut off at the table edge. This portals to
 * document.body and positions from the trigger's viewport rect instead, then
 * clamps itself inside the viewport (flipping above the trigger when there is
 * no room below). That is also why it is `position: fixed` — it must not scroll
 * away from its trigger inside the table.
 *
 * TOUCH: pointer events carry their type, so a touch tap opens the DETAILS
 * directly rather than leaving a hover card stranded on screen with no way to
 * dismiss it. Mouse users get the preview on hover and the details on click.
 */

const SHOW_DELAY_MS = 220;
const CARD_W = 280;
const GAP = 10;

export interface GoalPreviewProps {
  goal: GoalDTO;
  /** Resolved owner name, passed straight through to the details view. */
  ownerName?: string | null;
  /** Extra classes for the trigger wrapper (it is `display: contents`-ish by
   *  default so it does not disturb the caller's layout). */
  className?: string;
  children: React.ReactNode;
}

export function GoalPreview({ goal, ownerName, className, children }: GoalPreviewProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = React.useState(false);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Clamp horizontally so a row at either edge of a wide table still shows a
    // whole card; flip above when the trigger sits low in the viewport.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - CARD_W - 8);
    const below = window.innerHeight - r.bottom;
    const top = below < 170 ? r.top - GAP : r.bottom + GAP;
    setPos({ top, left });
  }, []);

  const show = React.useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      place();
    }, SHOW_DELAY_MS);
  }, [place]);

  const hide = React.useCallback(() => {
    clear();
    setPos(null);
  }, []);

  React.useEffect(() => () => clear(), []);

  const flipped = pos !== null && pos.top < (ref.current?.getBoundingClientRect().top ?? 0);

  return (
    <>
      <button
        ref={ref}
        type="button"
        // The whole point is opening the goal; announce that rather than leaving
        // a screen reader with a bare code like "Y3".
        aria-label={`${GOAL_LEVEL_LABEL[goal.period]}: ${goal.title || "Untitled goal"} — open details`}
        className={className ?? "cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50 rounded-md"}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show();
        }}
        onPointerLeave={hide}
        onFocus={place}
        onBlur={hide}
        onClick={() => {
          hide();
          setOpen(true);
        }}
      >
        {children}
      </button>

      {pos &&
        !open &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[110] rounded-xl border border-hairline bg-surface-card p-3 shadow-xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: CARD_W,
              transform: flipped ? "translateY(-100%)" : undefined,
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-altus-red">
              {GOAL_LEVEL_LABEL[goal.period]}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13.5px] font-bold leading-snug text-ink-strong">
              {goal.title || "Untitled goal"}
            </p>
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Notes</p>
            {goal.notes?.trim() ? (
              <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-soft">
                {goal.notes}
              </p>
            ) : (
              <p className="mt-0.5 text-[12.5px] italic text-ink-subtle">No notes added</p>
            )}
          </div>,
          document.body,
        )}

      {open && <GoalDetails goal={goal} ownerName={ownerName} onClose={() => setOpen(false)} />}
    </>
  );
}
