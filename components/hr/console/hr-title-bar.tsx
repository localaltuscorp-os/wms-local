"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import {
  useHrTitleBarSlot,
  useHrStepsToggle,
  useHrCustomTitleBarRegistration,
  useHrRouteTitle,
} from "./hr-console-context";
import { cn } from "@/lib/utils";

/**
 * A page's own frozen title bar. Rendered inline in the page's JSX like any
 * other component, but PORTALED into the sticky slot HrConsoleShell owns at
 * the top of the content column — so it's the page's own header content
 * (the same back-link / logo-or-title / action markup that page already
 * had), just relocated out of the scrolling body and pinned in place,
 * alongside the shared steps-collapse control.
 *
 * `left` / `title` / `right` mirror the sticky 3-column header shape most
 * /hr pages already used (back-link · title · action). The grid math
 * (`1fr auto 1fr`) keeps `title` mathematically centered regardless of how
 * much `left`/`right` content there is.
 *
 * `title` is deliberately the ONLY way to put a title in this bar, and it
 * takes the TEXT (or an icon + text fragment) — never a pre-styled node.
 * Pages used to hand the bar their own heading markup through three
 * different props, which is how one console ended up with titles at 15px,
 * 17px, 20px and clamp(28-44px), in two fonts, some centered and some shoved
 * against the right edge by being passed as `right`. Owning the typography
 * here is what keeps every module’s bar identical.
 *
 * There is deliberately NO subtitle slot. The bar carried one that showed
 * only while a page happened to fit without scrolling, which meant the same
 * module looked different depending on how much data it held. The bar is now
 * a fixed-height strip on every surface: title, and the page's own actions.
 */
export function HrTitleBar({
  left,
  title,
  right,
  className,
  printHidden = true,
}: {
  left?: React.ReactNode;
  /** The page's title — the TEXT, or an icon + text fragment. This bar owns
   *  its size, weight, font, colour and alignment; pass none of your own. */
  title?: React.ReactNode;
  right?: React.ReactNode;
  /** Override/extend the bar's own background + border, for a page whose
   *  header carried different styling than the shared default. */
  className?: string;
  /** Matches every migrated page's own header, which was `no-print` /
   *  `print:hidden` — chrome, not content, so it shouldn't print. */
  printHidden?: boolean;
}) {
  const slot = useHrTitleBarSlot();
  const { hasSteps, stepsCollapsed, toggleSteps } = useHrStepsToggle();
  const registerCustomTitleBar = useHrCustomTitleBarRegistration();
  // Default to the rail's name for this route; `title` is an override for the
  // pages that are more specific than their nav label.
  const routeTitle = useHrRouteTitle();
  const shownTitle = title ?? routeTitle;

  // Tell the shell a page has taken over the slot, so it doesn't ALSO render
  // its own fallback collapse-button bar on top of/alongside this one.
  React.useLayoutEffect(() => {
    registerCustomTitleBar(true);
    return () => registerCustomTitleBar(false);
  }, [registerCustomTitleBar]);

  if (!slot) return null;

  return createPortal(
    <div
      className={cn(
        "border-b border-hairline bg-white/90 backdrop-blur",
        printHidden && "print:hidden",
        className,
      )}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 px-6 py-3 max-md:px-4">
        <div className="flex items-start gap-3 justify-self-start">
          {/* Only while collapsed: expanded, this control lives in the
              step list's own header instead. */}
          {hasSteps && stepsCollapsed && (
            <button
              type="button"
              onClick={toggleSteps}
              aria-label="Expand steps list"
              title="Expand steps list"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-card text-ink-muted shadow-sm transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {left}
        </div>
        {/* The title rides the SAME row as the button, in the actual CENTER
            grid column — that `1fr auto 1fr` math is what keeps it centered
            across the FULL bar regardless of how wide `left`/`right` are.
            Nesting it in the left column instead (an earlier attempt) only
            centered it within that column's own slice of the bar.

            min-w-0 + truncate so a long title ellipses instead of forcing
            the bar wider than the content column. */}
        <div className="flex min-w-0 flex-col items-center justify-self-center pt-1.5 text-center">
          {shownTitle && (
            <h1
              className="max-w-full truncate text-[20px] font-black tracking-[-0.02em] text-ink-strong max-md:text-[16px]"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
            >
              {shownTitle}
            </h1>
          )}
        </div>
        <div className="justify-self-end">{right}</div>
      </div>


    </div>,
    slot,
  );
}
