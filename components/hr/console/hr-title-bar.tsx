"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useHrRouteTitle } from "./hr-console-context";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";

/**
 * A page's title (and its own controls), rendered into the app's GLOBAL TOP BAR.
 *
 * Called inline from a page's JSX like any other component; it draws nothing
 * where it sits. Both halves are PORTALED into slots AppTopBar owns - the title
 * to the far left, the controls immediately left of the search/create/bell
 * cluster.
 *
 * ── WHY THERE IS NO BAND ANY MORE ───────────────────────────────────────────
 * This used to render a full-width strip pinned under the top bar, with the
 * title centered in it. Every module then named itself twice: once in the top
 * bar and again, larger, in the band directly beneath - roughly 56px of vertical
 * room on every screen spent restating something the bar above already had room
 * for. The strip is gone and the title moved up into that bar.
 *
 * `title` is still the ONLY way to set one, and it takes the TEXT (or an icon +
 * text fragment) - never pre-styled markup. This component owns the size,
 * weight, font and colour, which is what keeps every module's title identical;
 * pages used to pass their own heading markup through three different props and
 * the console ended up with titles at 15px, 17px, 20px and clamp(28-44px), in
 * two fonts. Omit it and the rail's name for the route is used.
 */
export function HrTitleBar({
  left,
  title,
  right,
}: {
  /** Page controls shown BEFORE `right` in the top bar's action slot. */
  left?: React.ReactNode;
  /** The page's title — the TEXT, or an icon + text fragment. This component
   *  owns its typography; pass none of your own. */
  title?: React.ReactNode;
  /** Page controls — a print button, an edit link. */
  right?: React.ReactNode;
  /** Ignored. Both styled the BAND, which no longer exists; still accepted so
   *  the ~40 call sites did not all have to change at once, and so a page that
   *  passes them is not a type error. The top bar is already print-hidden
   *  chrome, which is what `printHidden` used to arrange. */
  className?: string;
  printHidden?: boolean;
}) {
  const slots = usePageChromeSlots();
  // Default to the rail's name for this route; `title` is an override for the
  // pages that are more specific than their nav label (a named letter, a named
  // policy, one candidate).
  const routeTitle = useHrRouteTitle();
  const shownTitle = title ?? routeTitle;

  // Tell the bar a page has named itself, so it stops ALSO drawing the
  // route-derived name. Cleared on unmount, which returns a page with no title
  // of its own to the derived one.
  const setHasPageTitle = slots?.setHasPageTitle;
  const claims = Boolean(slots && shownTitle);
  React.useEffect(() => {
    if (!setHasPageTitle || !claims) return;
    setHasPageTitle(true);
    return () => setHasPageTitle(false);
  }, [setHasPageTitle, claims]);

  // No chrome around this tree (the hub renders no top bar) - render nothing
  // rather than blanking the page over a missing heading.
  if (!slots) return null;

  const hasActions = left != null || right != null;

  return (
    <>
      {slots.title && shownTitle
        ? createPortal(
            // `topbar-heading` (app/globals.css) is the same type the bar's own
            // derived title uses, so a page that names itself looks identical to
            // one that does not rather than introducing a second heading style
            // into the same strip. truncate + min-w-0 so a long title ellipses
            // instead of pushing the clusters off the right edge.
            <h1 className="topbar-heading min-w-0 truncate">{shownTitle}</h1>,
            slots.title,
          )
        : null}

      {slots.actions && hasActions
        ? createPortal(
            <>
              {left}
              {right}
            </>,
            slots.actions,
          )
        : null}
    </>
  );
}
