"use client";

import { ChevronRight } from "lucide-react";
import { useHrStepsToggle } from "./hr-console-context";

/**
 * What shows in the title-bar slot for a page that hasn't been migrated to
 * <HrTitleBar> yet — just the floating button that re-opens a collapsed step
 * list (while it is open, that control lives in the step list's own header). Once a page adopts HrTitleBar, that
 * page's own portaled content replaces this (see HrConsoleShell).
 */
export function HrTitleBarFallback() {
  const { hasSteps, stepsCollapsed, toggleSteps } = useHrStepsToggle();
  // Expanded, the collapse control lives in the step list's own header;
  // this floating one exists only to bring a collapsed column back.
  if (!hasSteps || !stepsCollapsed) return null;

  return (
    // h-0 + absolute: this button is the ONLY thing in the sticky title-bar
    // slot on a page with no HrTitleBar, so giving it a band of its own pushed
    // that page's content down by the band's height the moment the steps column
    // collapsed — the same page sat higher while the column was open (where
    // this component renders nothing at all). Reserving zero height keeps the
    // control where it was on screen while letting content start at the top in
    // BOTH states.
    <div className="relative h-0 max-lg:hidden">
      <button
        type="button"
        onClick={toggleSteps}
        aria-label="Expand steps list"
        title="Expand steps list"
        className="absolute left-6 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface-card text-ink-muted shadow-sm transition-colors hover:bg-surface-soft hover:text-ink"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
