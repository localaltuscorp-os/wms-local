"use client";

import { useEffect } from "react";

/**
 * Display scaling is DISABLED.
 *
 * This provider used to apply the user's display-scale preference as a CSS
 * `zoom` on <html>. That broke the whole app: a non-unity `zoom` on an
 * ancestor double-applies to Radix/floating-ui portaled panels (every
 * dropdown, popover, tooltip, select), so menus flew off toward a screen
 * corner instead of anchoring under their trigger. On wide monitors the
 * default "auto-fit" produced zoom ≈ 1.33, so it broke for most users.
 *
 * CSS `zoom` is fundamentally incompatible with portaled floating UI — the
 * portal target must sit at zoom 1 for floating-ui's coordinate math to
 * work — so there is no small patch that keeps the geometric zoom. The
 * feature is removed; if "fit the UI to the screen" is wanted again it must
 * be rebuilt WITHOUT a geometric zoom (e.g. content max-widths or a density
 * scale), which does not disturb portal positioning.
 *
 * Kept as a mounted no-op so it (a) preserves the layout import contract and
 * (b) actively clears any stale `zoom` a previous build left on <html> in a
 * still-open tab. Renders nothing.
 */
export function DisplayScaleProvider() {
  useEffect(() => {
    // Clear any leftover zoom from the previous (zoom-applying) build.
    const root = document.documentElement;
    if (root.style.zoom && root.style.zoom !== "1" && root.style.zoom !== "normal") {
      root.style.zoom = "";
    }
  }, []);

  return null;
}
