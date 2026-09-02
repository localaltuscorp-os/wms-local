"use client";

import * as React from "react";

/**
 * WHETHER FOCUS MODE IS ON, shared between the two things that care: the
 * <FocusMode> controller mounted once in the app layout, and the toggle button
 * in the top bar.
 *
 * The state used to live inside <FocusMode> as plain `useState`, which was fine
 * while Ctrl+Q was the only way in. A button in the top bar is a second writer
 * and a second reader, and the two must never disagree about which icon to show
 * — so the flag moves out to a module store, the same `useSyncExternalStore`
 * pattern lib/client/section-search.ts and lib/client/kpi-focus.ts already use
 * (no provider to thread through a server-rendered layout).
 *
 * THE DOM IS NOT THE SOURCE OF TRUTH, BUT IT GETS A VOTE. Real fullscreen can
 * end without us: the browser's own Esc, F11, or a rejected requestFullscreen.
 * <FocusMode> listens for `fullscreenchange` and writes back here, which is why
 * the toggle below is deliberately NOT the optimistic
 * `setIsFocusMode(true)`-next-to-`requestFullscreen()` shape — that desyncs the
 * moment a user leaves fullscreen by any route other than this button.
 */

let on = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setFocusMode(next: boolean): void {
  if (next === on) return;
  on = next;
  emit();
}

export function toggleFocusMode(): void {
  setFocusMode(!on);
}

export function useFocusMode(): boolean {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on,
    // Server snapshot is always false: focus mode is entered by a gesture,
    // which cannot have happened before hydration.
    () => false,
  );
}
