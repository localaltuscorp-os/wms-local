"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { FIT_FLOOR, FIT_PLAN, PAGE_CONTENT_H } from "@/lib/hr/letters/fit";

export interface FitResult {
  /** The zoom applied to the letter body (1 = full size). */
  scale: number;
  /** Whether the body is in compact spacing. */
  compact: boolean;
  /** False when the letter does not fit one page even at the floor. */
  fits: boolean;
}

/**
 * FIT TO ONE PAGE, in the browser.
 *
 * Finds the `.alh-body` inside `containerRef`, then walks FIT_PLAN — the normal
 * layout, then compact spacing at each text scale — until the body is no taller
 * than one printed page of content. The chosen step stays on the element (CSS
 * zoom + `data-fit-compact`), so what is on screen is what `window.print()`
 * prints. Re-measures whenever the body changes size (typing, a field filled,
 * an entity swapped).
 *
 * Heights are compared in the page's own CSS pixels: the sheet may sit inside a
 * scaled container, so the measured height is divided by the sheet's on-screen
 * scale (its rendered width over its layout width).
 *
 * `viewKey` changes when a different letter body is mounted, so the hook
 * re-attaches to the new element.
 */
export function useFitOnePage(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  viewKey: string,
): FitResult {
  const [result, setResult] = useState<FitResult>({ scale: 1, compact: false, fits: true });

  useLayoutEffect(() => {
    const body = containerRef.current?.querySelector<HTMLElement>(".alh-body");
    const page = body?.closest<HTMLElement>(".alh-page");
    if (!body || !page) return;

    const heightInPagePx = (): number => {
      const pageRect = page.getBoundingClientRect();
      const onScreenScale = page.offsetWidth ? pageRect.width / page.offsetWidth : 1;
      return body.getBoundingClientRect().height / (onScreenScale || 1);
    };
    const fitsNow = (): boolean => heightInPagePx() <= PAGE_CONTENT_H + 0.5;

    const apply = (scale: number, compact: boolean) => {
      if (scale === 1) body.style.removeProperty("zoom");
      else body.style.setProperty("zoom", String(scale));
      if (compact) body.setAttribute("data-fit-compact", "1");
      else body.removeAttribute("data-fit-compact");
    };
    const settle = (next: FitResult) =>
      setResult((prev) =>
        prev.scale === next.scale && prev.compact === next.compact && prev.fits === next.fits ? prev : next,
      );

    const measure = () => {
      if (!enabled) {
        apply(1, false);
        settle({ scale: 1, compact: false, fits: fitsNow() });
        return;
      }
      for (const step of FIT_PLAN) {
        apply(step.scale, step.compact);
        if (fitsNow()) {
          settle({ scale: step.scale, compact: step.compact, fits: true });
          return;
        }
      }
      apply(FIT_FLOOR, true);
      settle({ scale: FIT_FLOOR, compact: true, fits: false });
    };

    // Measured on the next frame (fonts and images settled), then again on any
    // resize. Changing the zoom resizes the body too; the second pass lands on
    // the same step, so it settles instead of looping.
    let frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(body);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [containerRef, enabled, viewKey]);

  return result;
}
