"use client";

import * as React from "react";

/**
 * The two slots a page may fill in the app's global TOP BAR: its title, and its
 * own actions.
 *
 * WHY A CONTEXT AND NOT A PROP. AppTopBar and the page are SIBLINGS - ChromeShell
 * renders `{bar}` then `{children}` - so a page has no prop path to the bar above
 * it. Worse, the pages that carry titles sit inside the HR console, another
 * client component in between. A context hung above both is the only place the
 * two can meet, and the page then portals its own nodes in (see HrTitleBar), so
 * server-rendered content like a print button keeps working unchanged.
 *
 * This replaced a per-page TITLE BAND - a full-width strip under the top bar
 * carrying a centered heading. Two stacked bars said the same thing twice and
 * cost ~56px of vertical room on every screen; the title now rides in the bar
 * that was already there.
 */
type PageChromeSlots = {
  /** Where a page's title is rendered - the LEFT of the top bar. */
  title: HTMLElement | null;
  /** Where a page's own controls go - immediately left of the global cluster. */
  actions: HTMLElement | null;
  setTitle: (el: HTMLElement | null) => void;
  setActions: (el: HTMLElement | null) => void;
  /** True while a page has put its own title in `title`. AppTopBar shows the
   *  route-derived name only when this is false, so the bar never carries two
   *  titles at once. */
  hasPageTitle: boolean;
  setHasPageTitle: (present: boolean) => void;
};

const PageChromeSlotsContext = React.createContext<PageChromeSlots | null>(null);

export function PageChromeSlotsProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<HTMLElement | null>(null);
  const [actions, setActions] = React.useState<HTMLElement | null>(null);
  const [hasPageTitle, setHasPageTitle] = React.useState(false);
  const value = React.useMemo(
    () => ({ title, actions, setTitle, setActions, hasPageTitle, setHasPageTitle }),
    [title, actions, hasPageTitle],
  );
  return (
    <PageChromeSlotsContext.Provider value={value}>{children}</PageChromeSlotsContext.Provider>
  );
}

/**
 * The slots, or null when there is no app chrome around this tree.
 *
 * DELIBERATELY NEVER THROWS, unlike the HR console's own context. The hub
 * renders no top bar at all (ChromeShell drops it), and a page must still render
 * when there is nowhere to put its title - losing a heading is not a reason to
 * blank the screen. Callers check for null and skip the portal.
 */
export function usePageChromeSlots(): PageChromeSlots | null {
  return React.useContext(PageChromeSlotsContext);
}
