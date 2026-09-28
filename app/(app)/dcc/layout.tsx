import type { ReactNode } from "react";

/**
 * The DCC module's chrome: the five doors across the top, then the page.
 *
 * A LAYOUT rather than a component each page renders, so the bar does not
 * re-mount (and the row does not lose its sideways scroll position) when you
 * move between doors. It is also the one place that guarantees every DCC page
 * gets the bar — the old module let two of its pages quietly render without it.
 */
export default function DccLayout({ children }: { children: ReactNode }) {
  return children;
}
