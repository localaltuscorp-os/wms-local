"use client";

import * as React from "react";

/**
 * GROW A TEXTAREA TO ITS TEXT — and keep it grown.
 *
 * Measuring `scrollHeight` once, on first paint, was not enough in the grids:
 * the web font arrives a moment later, the same words wrap onto one more line,
 * and the box shows a small scrollbar of its own inside the cell. So this
 * measures again when the fonts finish loading and whenever the box changes
 * width, and the caller hides the textarea's own overflow — the grid scrolls,
 * the cell never does.
 */
export function useAutoHeight(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight is the content and padding only; the border (border-box
    // sizing) has to go on top, or the last line is clipped by two pixels.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [ref]);

  React.useLayoutEffect(fit, [fit, value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    void document.fonts?.ready.then(() => alive && fit());
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => fit());
    ro?.observe(el);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [ref, fit]);
}
