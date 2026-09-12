"use client";

import * as React from "react";
import type { HrConsoleModule } from "@/lib/hr/console-nav";

/**
 * Shared state HrConsoleShell owns and its descendants need — including ones
 * that arrive via `children` (a Server Component page), which has no normal
 * prop path back into a client-component parent's state. Context is how each
 * piece below reaches those descendants regardless of how they got there.
 */
type HrConsoleContextValue = {
  /** The module previewed in the rail (the step nav's source) — set the
   *  instant someone clicks a module with steps, before any navigation
   *  happens. Read by HrConsoleHome so /hr reacts to a rail click. */
  selectedModule: HrConsoleModule | null;

  /** What the RAIL calls the current route — the open step's name, else the
   *  module's. HrTitleBar shows this by default so a surface is labelled the
   *  same way you navigated to it (open "Candidate Interview Form" and the bar
   *  says exactly that, instead of whatever prose that page chose for itself).
   *  A page only passes its own `title` when it is more specific than the nav
   *  label — a named letter, a named policy, one candidate. */
  routeTitle: string | null;
};

const HrConsoleContext = React.createContext<HrConsoleContextValue | null>(null);

export function HrConsoleContextProvider({
  value,
  children,
}: {
  value: HrConsoleContextValue;
  children: React.ReactNode;
}) {
  return <HrConsoleContext.Provider value={value}>{children}</HrConsoleContext.Provider>;
}

function useHrConsoleContext(): HrConsoleContextValue {
  const ctx = React.useContext(HrConsoleContext);
  if (!ctx) {
    throw new Error(
      "This hook must be used inside the HR console (rendered by app/(app)/hr/layout.tsx).",
    );
  }
  return ctx;
}

/** The rail's currently previewed module, or null if none is selected. */
export function useHrConsolePreviewedModule(): HrConsoleModule | null {
  return useHrConsoleContext().selectedModule;
}

/**
 * The rail's name for the current route — see the field doc above.
 *
 * NON-THROWING, unlike its siblings, and deliberately so: HrTitleBar is not an
 * HR-console component. Its job is portaling a title and controls into the
 * GLOBAL top bar, and the console context supplies only the DEFAULT title. Two
 * pages outside the console already use it — /communications since Broadcasts
 * moved to Operations on 2026-09-12 — and the strict version crashed them at
 * render with "This hook must be used inside the HR console".
 *
 * Outside the console there is simply no rail-derived name, which is a null,
 * not an error: a page there passes its own `title`, and one that passes none
 * gets no title rather than a blank screen.
 */
export function useHrRouteTitle(): string | null {
  return React.useContext(HrConsoleContext)?.routeTitle ?? null;
}

