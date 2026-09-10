"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * A readable hover/focus tooltip for TRUNCATED labels and section
 * descriptions — shows the full text in a
 * comfortably-sized, wrapping bubble (unlike the tiny native `title`). The bubble
 * renders via a portal to <body> and is positioned against the trigger's bounding
 * rect, so scrollable / overflow-clipped parents (e.g. the Plan-My-Day columns)
 * never cut it off. Inline by default — drop it around the text inside an
 * existing `truncate` container.
 */
export function HoverTip({
  text,
  children,
  className,
}: {
  /**
   * Widened from `string` to ReactNode for the dashboard section headers, whose
   * descriptions carry inline counts (`<span>63</span> tasks in the current
   * filter`). Every existing caller passes a plain string and is unaffected.
   */
  text: React.ReactNode;
  children: React.ReactNode;
  /** Classes for the wrapper span — e.g. layout hints when it sits in a flex row. */
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number; below: boolean } | null>(null);

  const show = React.useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    /**
     * BELOW THE TRIGGER BY DEFAULT.
     *
     * This was the other way round — above unless the trigger sat within 150px
     * of the viewport top. On a dashboard section header that put the bubble
     * over the KPI strip and the section-nav bar directly above it: hovering a
     * heading to find out what it means covered the numbers you were reading.
     * A tooltip should explain the thing you are pointing at, not hide what you
     * already looked at to get there.
     *
     * Flipping up is kept as the fallback for the one case that needs it — a
     * trigger near the bottom of the window, where a bubble below would be cut
     * off by the viewport edge — and only when there is more room up there than
     * down here. `ESTIMATED_TIP_H` is a reserve, not a measurement: the bubble
     * is not in the DOM yet at this point, and it wraps to its text, so the
     * exact height is unknowable until after it is placed. 120px covers the
     * two- to three-line descriptions these carry.
     */
    const ESTIMATED_TIP_H = 120;
    const roomBelow = vh - r.bottom;
    const below = roomBelow >= ESTIMATED_TIP_H || r.top < ESTIMATED_TIP_H;

    setPos({
      left: Math.min(Math.max(12, r.left), vw - 372),
      top: below ? r.bottom + 8 : r.top - 8,
      below,
    });
  }, []);
  const hide = React.useCallback(() => setPos(null), []);

  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && text
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                transform: pos.below ? undefined : "translateY(-100%)",
                maxWidth: 360,
                zIndex: 10000,
                pointerEvents: "none",
                /* THE CARD SURFACE, NOT A DARK BUBBLE.
                
                   This was near-black on white type — the ONE tooltip in the
                   app that was, while the other five (goal-preview,
                   plan-task-table, item-detail, kpi-trend-sparkline,
                   month-calendar) all sit on `bg-surface-card` with a hairline
                   border. Two visual languages for the same gesture, and the
                   dark one silently swallowed any text that carried a colour of
                   its own: a `text-gray-900` count inside it rendered
                   invisible. Same tokens as the rest now, so a tooltip looks
                   like the cards it floats over. */
                background: "var(--color-surface-card)",
                color: "var(--color-ink-strong)",
                border: "1px solid var(--color-hairline-strong)",
                fontSize: 13,
                lineHeight: 1.45,
                fontWeight: 500,
                padding: "8px 11px",
                borderRadius: 12,
                /* Deeper than a card's own shadow: a white panel on a white
                   page has no contrast edge of its own, so the lift is the only
                   thing separating it from what it covers. */
                boxShadow:
                  "0 14px 34px -10px rgba(15, 23, 42, 0.28), 0 2px 6px rgba(15, 23, 42, 0.10)",
                whiteSpace: "normal",
                wordBreak: "break-word",
                animation: "hovertip-in 0.1s ease-out",
              }}
            >
              {text}
              <style>{"@keyframes hovertip-in{from{opacity:0}to{opacity:1}}"}</style>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export default HoverTip;
