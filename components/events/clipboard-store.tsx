"use client";

/**
 * Client clipboard store for spreadsheet-style Copy / Cut / Paste (design §3).
 *
 * Holds a snapshot of the selected events plus the mode. Paste re-anchors the
 * set at the focused slot (server-side); a `cut` paste deletes the originals
 * afterwards. Kept in React context so the keydown handler, context menu and
 * toolbar all share one clipboard.
 */
import * as React from "react";
import type { CalendarEvent } from "@/lib/monthly-events/types";

export type ClipboardMode = "copy" | "cut";

interface ClipboardState {
  items: CalendarEvent[];
  mode: ClipboardMode | null;
  /** Put events on the clipboard. */
  set: (items: CalendarEvent[], mode: ClipboardMode) => void;
  clear: () => void;
  has: boolean;
}

const ClipboardContext = React.createContext<ClipboardState | null>(null);

export function ClipboardProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CalendarEvent[]>([]);
  const [mode, setMode] = React.useState<ClipboardMode | null>(null);

  const set = React.useCallback((next: CalendarEvent[], m: ClipboardMode) => {
    setItems(next);
    setMode(m);
  }, []);
  const clear = React.useCallback(() => {
    setItems([]);
    setMode(null);
  }, []);

  const value = React.useMemo<ClipboardState>(
    () => ({ items, mode, set, clear, has: items.length > 0 }),
    [items, mode, set, clear],
  );
  return (
    <ClipboardContext.Provider value={value}>{children}</ClipboardContext.Provider>
  );
}

export function useClipboard(): ClipboardState {
  const ctx = React.useContext(ClipboardContext);
  if (!ctx) throw new Error("useClipboard must be used within <ClipboardProvider>");
  return ctx;
}
