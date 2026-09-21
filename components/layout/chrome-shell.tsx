"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";
import { PageChromeSlotsProvider } from "@/components/layout/page-chrome-slots";

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
/**
 * Does this route render the module LEFT RAIL?
 *
 * Exported because two components have to agree on the answer: ChromeShell
 * decides whether to mount the rail, and AuraTopBar decides whether to show the
 * account menu — the rail already carries one in its foot, and a second copy
 * 200px away in the bar is the kind of duplicate nobody notices until it looks
 * like a bug. One definition, so the two can never drift.
 *
 * Rule: EVERY module gets the rail, except the HR console's full-bleed surfaces
 * (which navigate via their own cards and back buttons) and the hub/shared
 * routes, which belong to no workspace.
 */
export function showsModuleRail(pathname: string): boolean {
  const ws = workspaceForPath(pathname);
  const isHrFullBleed =
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/policies" ||
    pathname.startsWith("/policies/") ||
    pathname === "/communications" ||
    pathname.startsWith("/communications/") ||
    pathname === "/dossier" ||
    pathname.startsWith("/dossier/") ||
    pathname === "/support" ||
    pathname.startsWith("/support/");
  return Boolean(ws) && !isHrFullBleed;
}

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
  // `/policies` is an HR surface at its own top-level route and renders the HR
  // console shell too (its own layout.tsx), so it must suppress the global
  // sidebar the same way /hr does — otherwise the console's module rail and this
  // sidebar would stack side by side.
  //
  // `/communications` (Broadcasts) is NOT in this list any more: it moved to the
  // Operations room on 2026-09-12 and dropped the console shell with it, so it
  // WANTS the global sidebar — that is where its Operations rail comes from.
  // Leaving it here would have given it no sidebar at all.
  const isHrFullBleed =
    pathname === "/hr" ||
    (pathname?.startsWith("/hr/") ?? false) ||
    pathname === "/policies" ||
    (pathname?.startsWith("/policies/") ?? false) ||
    pathname === "/dossier" ||
    (pathname?.startsWith("/dossier/") ?? false) ||
    pathname === "/support" ||
    (pathname?.startsWith("/support/") ?? false);
  // Same answer as `showsModuleRail` above, which the top bar reads.
  const showSidebar = showsModuleRail(pathname ?? "/");

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
  // ...and NOT under the HR console either. That console sizes itself to the
  // viewport (height: calc(100dvh - topbar)) and scrolls internally, so a dock
  // appended after it necessarily sits past the fold — making the OUTER page
  // scrollable purely to reach a strip of chrome. A stray Space keypress
  // scrolled into that dead band and there was nothing above to scroll back to.
  const dock = isHub || isHrFullBleed ? null : footer;
  // The dock sits IN FLOW at the end of the page and reserves its own height
  // (it used to be fixed, then sticky — both of which rode over whatever a page
  // ended with). So this padding only has to supply the gap BELOW it.
  // The HR console already fills the viewport exactly; trailing padding would
  // re-introduce the same overflow the dock did.
  //
  // THE HUB TAKES NONE EITHER, and for the same reason. It has no dock, and it
  // now CENTRES its card grid in the space under the hero — a trailing 40px
  // here is 40px the grid cannot see, so the gap above the cards came out 40px
  // larger than the gap below and the "centred" row sat visibly low. The hub
  // supplies its own breathing room with its py-6.
  const bottomPad = isHrFullBleed || isHub ? "" : "pb-5";

  // The hub is the module switchboard and renders the full DashboardHeader —
  // which already carries its own search — so a second bar there would stack two
  // search fields on one screen.
  const bar = isHub ? null : topBar;

  if (!showSidebar) {
    return (
      // The top bar is FULL-WIDTH on every route, HR included. The HR console
      // (isHrFullBleed) used to receive the bar through InsetTopBarProvider and
      // draw it inside its own CONTENT column, which shrank it to the column's
      // width and pushed the rail up beside it — a different-looking bar. Now it
      // renders here, full-width, and the console sits below it, sized to the
      // remaining height. `hr-shell-frame` is a PRINT HOOK (globals.css unclips
      // it under @media print); keep the name.
      <div
        className={
          isHrFullBleed
            ? "hr-shell-frame flex min-h-dvh flex-col"
            : `flex min-h-dvh flex-col ${bottomPad}`
        }
      >
        {/* The provider wraps BAR + CHILDREN together: a page portals its title
            and its own controls up into the bar, and the two are siblings, so a
            context above both is their only meeting point. */}
        <PageChromeSlotsProvider>
          {bar}
          {children}
        </PageChromeSlotsProvider>
        {dock}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className={`flex min-w-0 flex-1 flex-col max-md:pt-14 ${bottomPad}`}>
        <PageChromeSlotsProvider>
          {bar}
          {children}
        </PageChromeSlotsProvider>
        {dock}
      </div>
    </div>
  );
}
