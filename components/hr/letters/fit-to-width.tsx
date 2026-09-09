"use client";

import * as React from "react";

/**
 * Scales a fixed-width A4 sheet so it exactly fills the width of its container,
 * and keeps doing so as that container changes — which is what makes the letter
 * track the editing toolbar above it when either sidebar is collapsed or opened.
 *
 * WHY SCALE RATHER THAN REFLOW
 * The sheet is a real A4 page (794px = 210mm at 96dpi) and it is what Print /
 * Issue letter produce. Letting it reflow to the container width would give the
 * body longer lines than the PDF, so the preview would quietly stop matching the
 * document that actually goes out. Scaling grows every glyph, rule and ribbon by
 * the same factor, so the on-screen letter stays a faithful preview.
 *
 * WHY `zoom` AND NOT `transform: scale()`
 * `transform` does not change an element's layout box: the wrapper would keep
 * the UNSCALED height, leaving a large gap under a shrunk letter or clipping an
 * enlarged one. The letter's height is content-dependent (fields grow as HR
 * types), so there is no static height to compensate with. `zoom` participates
 * in layout, so the wrapper's height follows the scale for free.
 *
 * ON THE CODEBASE'S `zoom` BAN
 * `app/layout.tsx` and `page-shell.tsx` both forbid `zoom` — a non-unity zoom on
 * an ANCESTOR of a Radix / floating-ui portal double-applies to the portalled
 * panel and throws it off toward a corner. That hazard needs a portal inside the
 * zoomed subtree. Here the zoom is scoped to the sheet alone: the toolbar with
 * its selects sits OUTSIDE it, and the sheet's own popovers (the rich editor's
 * table tools) are absolutely positioned in-flow, not portalled — so they scale
 * with the page and stay put. Do not widen this wrapper to cover the toolbar.
 *
 * PRINT is unaffected: `.alw-fit` resets to `zoom: 1` under `@media print` in
 * both editors' stylesheets, so the PDF is a true A4 page whatever the screen
 * was showing.
 */
export function FitToWidth({
  children,
  className,
  /** Natural width of the sheet being scaled. Must match <Letterhead>. */
  base = 794,
}: {
  children: React.ReactNode;
  className?: string;
  base?: number;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  // 1 until measured — that is exactly today's look (a centred 794px sheet), so
  // the pre-measure frame degrades to the old behaviour rather than to nothing.
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      // Quantised to 3dp. Without this, a sub-pixel width change (a scrollbar
      // appearing because the letter just got taller) can re-trigger the
      // observer in a loop; rounding gives it a fixed point to settle on.
      const next = Math.round((width / base) * 1000) / 1000;
      setScale((prev) => (prev === next ? prev : next));
    });

    ro.observe(host);
    return () => ro.disconnect();
  }, [base]);

  return (
    // The HOST stays unzoomed and block-level: it reports the true container
    // width, and its size cannot be pushed around by the scaled child. Zooming
    // the host itself would make its own `width: 100%` resolve against a zoomed
    // containing block — a feedback loop.
    <div ref={hostRef} className={className}>
      <div className="alw-fit" style={{ zoom: scale }}>
        {children}
      </div>
    </div>
  );
}
