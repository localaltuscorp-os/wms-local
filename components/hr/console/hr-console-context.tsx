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
  /** The module previewed in the rail (column 2's source) — set the instant
   *  someone clicks a module with steps, before any navigation happens. Read
   *  by HrConsoleHome so the /hr front door reacts to a rail click. */
  selectedModule: HrConsoleModule | null;

  /** Whether the current selection has a steps column to collapse at all. */
  hasSteps: boolean;
  stepsCollapsed: boolean;
  toggleSteps: () => void;

  /** The sticky DOM node HrConsoleShell renders at the top of the content
   *  column, that a page's own HrTitleBar portals its header into. Null
   *  until the shell has mounted it. */
  titleBarSlot: HTMLDivElement | null;

  /** True while some page's HrTitleBar is mounted and has portaled content
   *  into titleBarSlot — so the shell knows not to also render its OWN
   *  fallback collapse-button bar (pages that haven't been migrated to
   *  HrTitleBar yet still get that fallback). */
  hasCustomTitleBar: boolean;
  setHasCustomTitleBar: (present: boolean) => void;

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

/** The shared steps-column collapse control — same state either the shell's
 *  own fallback bar or a page's HrTitleBar renders the button from. */
export function useHrStepsToggle() {
  const { hasSteps, stepsCollapsed, toggleSteps } = useHrConsoleContext();
  return { hasSteps, stepsCollapsed, toggleSteps };
}

/** The rail's name for the current route — see the field doc above. */
export function useHrRouteTitle(): string | null {
  return useHrConsoleContext().routeTitle;
}

export function useHrTitleBarSlot(): HTMLDivElement | null {
  return useHrConsoleContext().titleBarSlot;
}

export function useHrCustomTitleBarRegistration(): (present: boolean) => void {
  return useHrConsoleContext().setHasCustomTitleBar;
}

