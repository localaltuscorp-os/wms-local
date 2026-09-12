"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";

/**
 * The two pieces of Aura that need a browser: the pointer-tracked sheen and the
 * collapsible rail.
 *
 * They live here, as leaf client components, so `app/(app)/hub/page.tsx` stays a
 * Server Component — the hub runs the compulsory daily gate on every request and
 * must never become a client page.
 *
 * Neither one touches React state for the thing it animates. The sheen writes
 * two CSS custom properties straight onto the hovered pane, and the rail toggle
 * flips one class on the layout element. Re-rendering a twelve-card grid on
 * every pointermove is exactly the cost this avoids.
 */

/** The layout element the rail toggle collapses. Shared with the hub page. */
export const AURA_LAYOUT_ID = "aura-layout";

const RAIL_KEY = "altus.auraRailHidden";

/**
 * A soft highlight tracks the pointer across every interactive pane, via the
 * `--mx` / `--my` custom properties that `.aura-glass::after` reads.
 *
 * Renders nothing. `passive: true` keeps it off the scroll path, and the
 * listener is delegated from `document` rather than bound per card — one
 * listener for the whole page instead of one per pane.
 */
export function AuraSheen() {
  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      const pane = target?.closest<HTMLElement>(".aura-interactive");
      if (!pane) return;
      const r = pane.getBoundingClientRect();
      pane.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      pane.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    }
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}

/**
 * Show / hide the workspace rail. The choice is remembered in `localStorage`,
 * and `\` toggles it from anywhere on the page.
 *
 * The initial state is applied in an effect rather than during render because
 * the server has no way to know it — reading `localStorage` while rendering
 * would be a hydration mismatch. The rail is therefore open for one frame on a
 * "hidden" reload, which is the honest trade for keeping this page on the
 * server.
 */
export function AuraRailToggle() {
  const [hidden, setHidden] = React.useState(false);

  // Apply to the DOM whenever it changes, and remember it.
  React.useEffect(() => {
    document.getElementById(AURA_LAYOUT_ID)?.classList.toggle("aura-rail-hidden", hidden);
    try {
      window.localStorage.setItem(RAIL_KEY, hidden ? "1" : "0");
    } catch {
      // Private mode / blocked storage — the toggle still works this session.
    }
  }, [hidden]);

  // Restore the remembered choice once, on mount.
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === "1") setHidden(true);
    } catch {
      // ignore
    }
  }, []);

  // `\` toggles the rail — but never while the user is typing.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "\\" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.getAttribute("role") === "combobox")
      ) {
        return;
      }
      e.preventDefault();
      setHidden((h) => !h);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      type="button"
      className="aura-glass aura-interactive aura-icon-btn max-lg:hidden"
      aria-label={hidden ? "Show workspace list" : "Hide workspace list"}
      aria-expanded={!hidden}
      aria-controls={AURA_LAYOUT_ID}
      title={`${hidden ? "Show" : "Hide"} workspace list (\\)`}
      onClick={() => setHidden((h) => !h)}
    >
      <PanelLeft size={18} strokeWidth={1.8} />
    </button>
  );
}
