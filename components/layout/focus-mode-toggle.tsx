"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useFocusMode, toggleFocusMode } from "@/lib/client/focus-mode-store";

/**
 * The top bar's focus-mode button, beside the red + .
 *
 * IT ONLY WRITES THE FLAG. Everything the mode actually does — the
 * `data-focus-mode` attribute, the CSS that collapses the rail and the header,
 * the real-fullscreen request, the Esc binding and the exit pill — already
 * lives in <FocusMode> (components/layout/focus-mode.tsx), mounted once in the
 * app layout. A second copy of `requestFullscreen()` here would be a second
 * place for the two to disagree about whether the mode is on.
 *
 * WHY THIS DOES NOT SET STATE NEXT TO requestFullscreen. The obvious
 * implementation calls `requestFullscreen()` and `setIsFocusMode(true)` side by
 * side. That is wrong in three ordinary cases, all of which leave the icon
 * showing the opposite of reality:
 *
 *   • the user leaves fullscreen with the browser's own Esc or F11 — the
 *     browser exits, the flag stays true;
 *   • `requestFullscreen()` rejects (no user gesture, an iframe without the
 *     permission, a browser that refuses) — nothing happens, the flag says it
 *     did;
 *   • `exitFullscreen()` is async and can be raced by a second click.
 *
 * <FocusMode> already listens for `fullscreenchange` and writes the flag back,
 * so the DOM corrects us. This button only ever asks for a toggle.
 *
 * ONE THING WORTH KNOWING: focus mode hides `header.header-light`, which is
 * this bar. So the Minimize2 state below is real but rarely seen — once the
 * mode is on, the button has been hidden along with the rest of the chrome and
 * the floating "Exit Full Screen" pill is the affordance. The swapped icon is
 * kept because the button is also rendered on surfaces that opt out of the
 * collapse, and an icon that lies in those cases would be worse than one that
 * is occasionally redundant.
 */
export function FocusModeToggle() {
  const on = useFocusMode();
  return (
    <button
      type="button"
      onClick={toggleFocusMode}
      aria-pressed={on}
      title={on ? "Exit Full Screen (Esc)" : "Focus Mode / Full Screen (Esc to exit)"}
      aria-label={on ? "Exit full screen" : "Enter focus mode"}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      {on ? (
        <Minimize2 className="size-5 text-red-600" strokeWidth={2.2} />
      ) : (
        <Maximize2 className="size-5" strokeWidth={2.2} />
      )}
    </button>
  );
}
