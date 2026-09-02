"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * A readable hover/focus tooltip for TRUNCATED labels — shows the full text in a
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
  text: string;
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
    const below = r.top < 150; // not enough room above → drop below the trigger
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
                background: "#111114",
                color: "#ffffff",
                fontSize: 13,
                lineHeight: 1.45,
                fontWeight: 500,
                padding: "8px 11px",
                borderRadius: 10,
                boxShadow: "0 14px 34px -10px rgba(0,0,0,0.55)",
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
