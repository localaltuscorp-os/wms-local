"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";

/**
 * A page's own name, rendered into the app's GLOBAL TOP BAR instead of into the
 * page body. Draws nothing where it sits.
 *
 * WHY IT EXISTS. Most pages need no title element at all — AppTopBar already
 * derives one from the rail entry that owns the route, and a page that then
 * printed its own heading underneath was naming itself twice. Those in-page
 * headings were deleted rather than moved.
 *
 * This is for the remainder: a page whose real name the ROUTE cannot supply.
 * `/archived` has no rail entry, so `navTitleFor` returns null and the bar falls
 * back to the module label — the page would go from saying "Archived" to saying
 * "WMS". Handing the name to the bar keeps it, and still leaves exactly one
 * heading on screen.
 *
 * This is the general twin of HrTitleBar, which does the same thing for the HR
 * console and additionally carries that console's action slot. Both write to the
 * same two slots (components/layout/page-chrome-slots), and both set
 * `hasPageTitle` so the bar stops drawing its derived name — without that flag
 * the bar would carry two titles at once.
 */
export function PageTitle({ title }: { title: React.ReactNode }) {
  const slots = usePageChromeSlots();
  const setHasPageTitle = slots?.setHasPageTitle;
  const claims = Boolean(slots && title);

  // Cleared on unmount, which returns a page with no title of its own to the
  // route-derived one.
  React.useEffect(() => {
    if (!setHasPageTitle || !claims) return;
    setHasPageTitle(true);
    return () => setHasPageTitle(false);
  }, [setHasPageTitle, claims]);

  // No chrome around this tree (the hub renders no top bar) — render nothing
  // rather than blanking the page over a missing heading.
  if (!slots?.title || !title) return null;

  // `topbar-heading` (app/globals.css) is the same type the bar's own derived
  // title uses, so a page that names itself looks identical to one that does
  // not. truncate + min-w-0 so a long name ellipses instead of pushing the
  // search/create/bell cluster off the right edge.
  return createPortal(<h1 className="topbar-heading min-w-0 truncate">{title}</h1>, slots.title);
}
