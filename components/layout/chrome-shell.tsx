"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";

/**
 * Decides the app chrome CLIENT-side so it stays correct across SOFT navigations.
 *
 * WHY THIS EXISTS: the `(app)` layout is a SHARED layout — Next.js does NOT re-run
 * it on client-side navigation between routes it wraps (only the pages re-render).
 * So a server value the layout reads once (the middleware's `x-pathname` header)
 * goes STALE the moment you soft-navigate: the sidebar would stick to whatever
 * workspace you first landed on — showing on the hub, vanishing on a module — and
 * only "correct itself" on a full reload / HMR. `usePathname()` is reactive on the
 * client, so the show/hide decision here is always in sync with the current page.
 *
 * Rule: EVERY module — including WMS — uses the vertical left rail. Only the hub
 * and shared surfaces (which have no workspace) render without it. The `sidebar`
 * is server-rendered once and passed in; its inner nav (MainNav) + brand already
 * read `usePathname()`, so its contents track the current route too.
 */
export function ChromeShell({
  sidebar,
  footer,
  topBar,
  children,
}: {
  sidebar: ReactNode;
  /** Site-wide module footer, server-rendered once and passed in (same pattern
   *  as `sidebar`). Rendered as the LAST child of the page column in BOTH
   *  branches, so every route ends with it. */
  footer?: ReactNode;
  /** App-wide top bar (global search + notification bell). FIRST child of the
   *  page column in BOTH branches, so every route — rail or full-bleed — carries
   *  it. Server-rendered and passed in, same as `sidebar`. */
  topBar?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  // WMS now uses the rail too — show it for ANY workspace; only the hub / shared
  // surfaces (ws === undefined) render bare. Exceptions: the HR front door (`/hr`),
  // the Candidate Interview Form (`/hr/intake`), the Candidate Records list
  // (`/hr/candidates`), the per-person HR Record hub (`/hr/record`) and the Letters
  // library + each letter page (`/hr/letters`, `/hr/letters/<key>`) are full-screen
  // focused surfaces — all render with NO rail (their own back button is the nav).
  // Other stage sub-pages keep their rail.
  // The HR module never shows the left rail — it navigates via its own cards,
  // stage pop-ups and in-page back buttons. Every /hr surface is full-bleed. The
  // Help Desk (`/support`) is part of the HR room too — reached from the HR-home
  // quick-popup — so it is rail-less as well, matching the rest of the module.
  const isHrFullBleed =
    pathname === "/hr" ||
    (pathname?.startsWith("/hr/") ?? false) ||
    pathname === "/support" ||
    (pathname?.startsWith("/support/") ?? false);
  const showSidebar = Boolean(ws) && !isHrFullBleed;

  // Sticky-footer frame (both branches): the page column is a FULL-HEIGHT flex
  // column, so the footer — which every page renders as the last sibling of its
  // top-level fragment — can `mt-auto` itself down to the bottom of the viewport
  // instead of floating mid-screen on short pages. Content above it keeps its
  // natural height and simply grows past the fold on long pages.
  // The module footer is the LAST child of the page column in both branches, and
  // carries `mt-auto` — so on a short page it sits at the bottom of the viewport
  // rather than floating under the content, and on a long one it simply follows.
  // The HUB does not get the dock: it IS the module picker, so a floating copy
  // of the same ten links over the grid is noise. It ends after the cards.
  const isHub = pathname === "/hub";
  const dock = isHub ? null : footer;
  // The dock sits IN FLOW at the end of the page and reserves its own height
  // (it used to be fixed, then sticky — both of which rode over whatever a page
  // ended with). So this padding only has to supply the gap BELOW it. The hub
  // has no dock but still wants breathing room under the grid.
  const bottomPad = isHub ? "pb-10" : "pb-5";

  // The hub is the module switchboard and renders the full DashboardHeader —
  // which already carries its own search — so a second bar there would stack two
  // search fields on one screen.
  const bar = isHub ? null : topBar;

  if (!showSidebar) {
    return (
      <div className={`flex min-h-dvh flex-col ${bottomPad}`}>
        {bar}
        {children}
        {dock}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className={`flex min-w-0 flex-1 flex-col max-md:pt-14 ${bottomPad}`}>
        {bar}
        {children}
        {dock}
      </div>
    </div>
  );
}
