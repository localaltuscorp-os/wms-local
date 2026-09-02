"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useFocusMode, setFocusMode, toggleFocusMode } from "@/lib/client/focus-mode-store";

/**
 * FOCUS MODE — Ctrl+Q collapses the app chrome so the surface you are working on
 * fills the screen; Esc (or Ctrl+Shift+Q) restores it.
 *
 * ⚠️ WHY NOT Ctrl+W TO EXIT (Sir asked for it): Ctrl+W is the browser's
 * CLOSE-TAB shortcut and is NOT interceptable — Chrome and Edge handle it before
 * the page sees it and ignore preventDefault(), because a page that could swallow
 * Ctrl+W could trap you in a tab. Binding it would do nothing at best and close
 * the user's tab (losing unsaved work) at worst. Esc is the conventional exit
 * from any full-screen/immersive state and needs no modifier; Ctrl+Shift+Q is
 * kept as the symmetric twin of the enter key for muscle memory.
 *
 * Implementation: a `data-focus-mode` attribute on <html>, so the hiding is pure
 * CSS (globals.css) and no layout component needs to know this exists. It also
 * asks for real browser fullscreen — best-effort, since that requires a user
 * gesture and can be blocked; the chrome-collapse works either way.
 */

const ATTR = "data-focus-mode";

function setFocus(on: boolean): void {
  const el = document.documentElement;
  if (on) el.setAttribute(ATTR, "on");
  else el.removeAttribute(ATTR);
  // Real fullscreen is a bonus, never a requirement — a rejected promise here
  // must not break the chrome-collapse the user actually asked for.
  try {
    if (on && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  } catch {
    /* fullscreen unavailable — the CSS collapse still applies */
  }
}

/**
 * Mounted once, next to the other global key handling. Owns the Ctrl+Q / Esc
 * bindings and renders the "Exit full screen" affordance so the mode is never a
 * trap for someone who arrived by accident.
 *
 * The flag itself lives in lib/client/focus-mode-store so the top bar's toggle
 * button can drive and read the same state — see the note there.
 */
export function FocusMode() {
  const on = useFocusMode();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl/⌘ + Q — enter. Not browser-reserved on Windows Chrome/Edge; on
      // macOS ⌘Q quits the browser, so we accept Ctrl+Q there rather than ⌘Q.
      if (e.key.toLowerCase() === "q" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Shift+Q exits (the symmetric twin, since Ctrl+W cannot be used).
        if (e.shiftKey) {
          e.preventDefault();
          setFocusMode(false);
          return;
        }
        e.preventDefault();
        toggleFocusMode();
        return;
      }
      if (e.key === "Escape") setFocusMode(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    setFocus(on);
    return () => setFocus(false);
  }, [on]);

  // Keep our state honest if the user leaves fullscreen with the browser's own
  // F11 / Esc rather than ours.
  React.useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!on) return null;
  return (
    /* TOP-CENTRE, not the bottom-right corner it used to sit in. Focus mode
       hides the top bar, so the top of the viewport is exactly where the eye
       goes looking for the chrome that just vanished — and it is where every
       browser puts its own "you are now full screen" notice, which this has to
       replace once that notice fades. */
    <button
      type="button"
      onClick={() => setFocusMode(false)}
      className="fixed left-1/2 top-3 z-[100] inline-flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/90 px-4 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-red-600 print:hidden"
      title="Exit full screen (Esc)"
    >
      <X size={13} strokeWidth={2.8} /> Exit Full Screen
    </button>
  );
}
