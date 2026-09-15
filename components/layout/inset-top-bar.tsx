"use client";

import * as React from "react";

/**
 * The app's top bar, handed DOWN to a shell that owns its own left rail so the
 * bar can be rendered INSIDE that rail's content column instead of above it.
 *
 * WHY. On a normal module route ChromeShell lays the page out as
 * `[ global sidebar | [ top bar / page ] ]` — the rail runs the full height of
 * the viewport and the bar starts where the content column starts. The HR
 * console is different: it brings its OWN rail as part of `children`, so the
 * only place ChromeShell could put the bar was above the whole thing. That
 * stacked a full-width strip over the rail, pushed the rail's brand + nav
 * controls ~56px down the screen, and left the page title stranded above the
 * rail rather than above the page it names — the one module that did not match
 * every other module's chrome.
 *
 * Passing the element through a context (rather than rendering it in place)
 * lets HrConsoleShell drop it at the top of its content column, which puts the
 * title over the page and returns the rail to the top of the viewport. The bar
 * is still constructed once, in the (app) layout, and still sits inside the
 * same PageChromeSlotsProvider as the page — so a page's portaled title and
 * actions land in it exactly as before.
 */
const InsetTopBarContext = React.createContext<React.ReactNode>(null);

export function InsetTopBarProvider({
  bar,
  children,
}: {
  bar: React.ReactNode;
  children: React.ReactNode;
}) {
  return <InsetTopBarContext.Provider value={bar}>{children}</InsetTopBarContext.Provider>;
}

/** The bar to render in this shell's content column, or null when the chrome
 *  around us already rendered it itself. */
export function useInsetTopBar(): React.ReactNode {
  return React.useContext(InsetTopBarContext);
}
