"use client";

import * as React from "react";

/**
 * Hides the DOCUMENT scrollbar while this page is on screen, without taking
 * scrolling away: wheel, touchpad, keyboard and touch all still work, and the
 * page still scrolls exactly as far. Only the bar itself goes.
 *
 * Scoped by MOUNT: the class goes on <html> when the page opens and comes off
 * when it closes, so no other route loses its scrollbar. `.no-scrollbar` is the
 * app's existing utility (globals.css), used by the header nav for the same
 * reason — a scroll region whose bar is visual noise.
 *
 * The cleanup is what makes this safe. Leaving the class behind would strip the
 * scrollbar from every page visited afterwards, and nothing on those pages
 * would explain why.
 */
export function HidePageScrollbar() {
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("no-scrollbar");
    return () => root.classList.remove("no-scrollbar");
  }, []);

  return null;
}
