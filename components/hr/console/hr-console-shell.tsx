"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { HR_CONSOLE_MODULES, locateHrRoute } from "@/lib/hr/console-nav";
import { cn } from "@/lib/utils";
import { HrModuleRail } from "./hr-module-rail";
import { HrStepList } from "./hr-step-list";
import { HrConsoleContextProvider } from "./hr-console-context";
import { HrTitleBarFallback } from "./hr-title-bar-fallback";
import { HrModuleGhost } from "./hr-module-ghost";

/**
 * The HR workspace — a three-column console wrapping every /hr surface:
 *
 *   module rail (256px) │ step list (320px) │ the page itself
 *
 * Applied from app/(app)/hr/layout.tsx, so `children` is the real Next.js page
 * for the current route and the console never renders placeholder content. The
 * global search + notification bar is NOT repeated here — the app's own
 * AppTopBar already sits above this shell on every route.
 *
 * Column 2 is driven by a SELECTED module, seeded from (and re-synced to) the
 * current route: browsing the rail previews another module's steps without
 * navigating, but landing on a new route always re-points it at that route's
 * own module.
 *
 * The content column's own top strip is a STICKY SLOT (`titleBarSlot`) that a
 * migrated page fills by rendering <HrTitleBar> — that page's own header
 * (back-link / logo-or-title / action, plus its eyebrow/heading/subtitle "title
 * block"), portaled up here so it freezes at the top instead of scrolling away.
 * A page that hasn't been migrated yet renders nothing into the slot, so
 * HrTitleBarFallback (just the steps-collapse button) shows there instead.
 */
export function HrConsoleShell({
  user,
  children,
}: {
  user: { name: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/hr";
  const searchParams = useSearchParams();
  // Two INDEPENDENT toggles — the rail's own button (in HrModuleRail) collapses
  // only column 1; the title bar's button collapses only column 2. They used
  // to share one `collapsed` flag, which meant either button closed both.
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [stepsCollapsed, setStepsCollapsed] = React.useState(false);
  const toggleSteps = React.useCallback(() => setStepsCollapsed((v) => !v), []);

  // The sticky portal target at the top of the content column, and whether a
  // page has claimed it (see HrTitleBar / HrTitleBarFallback below).
  const [titleBarSlot, setTitleBarSlot] = React.useState<HTMLDivElement | null>(null);
  const [hasCustomTitleBar, setHasCustomTitleBar] = React.useState(false);


  const located = React.useMemo(() => locateHrRoute(pathname), [pathname]);
  const activeModuleId = located.module?.id ?? null;

  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(activeModuleId);
  // Follow the route: a soft navigation into another module re-points column 2.
  React.useEffect(() => {
    if (activeModuleId) setSelectedModuleId(activeModuleId);
  }, [activeModuleId]);

  // Picking a module in the rail always returns column 2 to its DEFAULT
  // (expanded) state. That covers both halves of the same rule:
  //   • the module you're already on — so the rail row itself is a way back
  //     from a collapsed step list, not just the title bar's chevron;
  //   • a different module — which starts fresh rather than inheriting the
  //     previous module's collapsed state (its content resets to the ghost
  //     pane too, see `previewingOtherModule` below).
  // Only ever EXPANDS: collapsing stays the chevron's job, so clicking an
  // already-expanded module is a no-op rather than a toggle.
  const selectModule = React.useCallback((id: string) => {
    setSelectedModuleId(id);
    setStepsCollapsed(false);
  }, []);

  // /hr?open=<stage> preselects that module without navigating into a step —
  // the target of every "Back to <Stage>" button in the room (the old landing
  // page used the same param to re-open its stage pop-up).
  const openParam = searchParams?.get("open") ?? null;
  React.useEffect(() => {
    if (openParam && HR_CONSOLE_MODULES.some((m) => m.id === openParam)) {
      setSelectedModuleId(openParam);
    }
  }, [openParam]);

  const selectedModule = React.useMemo(
    () => HR_CONSOLE_MODULES.find((m) => m.id === selectedModuleId) ?? null,
    [selectedModuleId],
  );
  const hasSteps = (selectedModule?.subModules.length ?? 0) > 0;

  // Picked a module in the rail while a page from a DIFFERENT module is still
  // the routed one (clicking a module only previews its steps — it doesn't
  // navigate). Leaving `children` mounted would show the old module's page
  // next to the new module's rail highlight and step list, all three
  // disagreeing. Show that module's ghost pane instead, exactly like the /hr
  // front door does, until a step is actually chosen.
  //
  // Guarded on `activeModuleId !== null` so the bare /hr route is untouched:
  // there `children` IS HrConsoleHome, which already renders the same ghost
  // (and owns the ?policies=1 popup, which must stay mounted).
  const previewingOtherModule =
    activeModuleId !== null && selectedModuleId !== null && selectedModuleId !== activeModuleId;

  // The rail's own label for wherever we are: the open step, else its module.
  const routeTitle = located.subModule?.title ?? located.module?.title ?? null;

  const consoleContext = React.useMemo(
    () => ({
      selectedModule,
      hasSteps,
      stepsCollapsed,
      toggleSteps,
      titleBarSlot,
      hasCustomTitleBar,
      setHasCustomTitleBar,
      routeTitle,
    }),
    [
      selectedModule,
      hasSteps,
      stepsCollapsed,
      toggleSteps,
      titleBarSlot,
      hasCustomTitleBar,
      routeTitle,
    ],
  );

  return (
    <div
      className="flex overflow-hidden bg-canvas-base"
      style={{ height: "calc(100dvh - var(--app-topbar-h))" }}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-all duration-300 ease-in-out max-lg:hidden",
          // Collapsed → a 64px ICON STRIP, not a full hide. The rail's own
          // collapse/expand toggle lives inside HrModuleRail, so hiding this
          // column entirely (w-0) would hide the only control that could bring
          // it back — a self-trapping toggle. The icon strip keeps it reachable,
          // matching how the app's global left sidebar collapses.
          //
          // 256px, not the original 236px: the longest label ("Enterprise
          // Communications") renders ~161px, and the row's fixed chrome — nav
          // padding 16 + button padding 20 + icon 16 + two 10px gaps + the
          // 12px external-link arrow — eats 84px. So the row needs ~245px;
          // 236px truncated it to "Enterprise Communicati…". This leaves ~11px
          // of slack — enough to absorb font-rendering variance without
          // stranding visibly empty rail beside the longest row.
          railCollapsed ? "w-16" : "w-[256px]",
        )}
      >
        <HrModuleRail
          collapsed={railCollapsed}
          selectedModuleId={selectedModuleId}
          activeModuleId={activeModuleId}
          onSelect={selectModule}
          onToggleRail={() => setRailCollapsed((v) => !v)}
          user={user}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {/* Column 2 exists only for a module that actually has an option
              list. A leaf module (Holiday List, Policies, …) has nothing to
              choose between — its content opens straight on the right — and
              the nothing-selected home state has no list either, so both
              skip this column entirely rather than showing an empty shell. */}
          {hasSteps && (
            <div
              className={cn(
                "shrink-0 overflow-hidden transition-all duration-300 ease-in-out max-lg:hidden",
                stepsCollapsed ? "w-0" : "w-[320px]",
              )}
            >
              <HrStepList
                module={selectedModule}
                activeHref={previewingOtherModule ? null : (located.subModule?.href ?? null)}
                onCollapse={toggleSteps}
              />
            </div>
          )}

          {/* --app-topbar-h is a body-scoped CSS var (see globals.css) that
              individual /hr pages use via the `.sticky-below-topbar` utility
              so their OWN internal header sticks just under the real global
              AppTopBar. Those pages were built to be the page's only scroll
              container. Now they're nested inside THIS div — a second,
              independent scroll container — so that inherited 56px offset
              pins their header partway down `.content`'s own viewport
              instead of at its top, leaving it floating over scrolled
              content. Overriding the var to 0 here makes it resolve
              correctly for every such page without touching each one
              (matters for pages not yet migrated to HrTitleBar, which still
              use that utility for their own inline sticky header). */}
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas-base"
            style={{ "--app-topbar-h": "0px" } as React.CSSProperties}
          >
            <HrConsoleContextProvider value={consoleContext}>
              {/* The portal target every migrated page's <HrTitleBar> fills.
                  Sticky so it - and whatever a page portals into it - stays
                  pinned at the top of THIS scroll container as the page
                  scrolls beneath it.

                  Z-INDEX BAND - the bar sits in a deliberate gap between two
                  ranges, and page code must respect both sides of it:

                    <= z-40   in-flow page content. Cards that need to beat a
                              later sibling (every .rec-fade keeps a transform,
                              so each is its own stacking context) and the
                              dropdown panels inside them. These scroll with the
                              page and MUST pass under the bar.
                    z-45      this bar.
                    >= z-50   `fixed inset-0` overlays - the letter, policy and
                              assessment modals. These cover the whole console
                              and MUST paint over the bar.

                  It was z-30, the SAME value HR Record's person-picker card
                  uses. Equal z-index falls back to DOM order, and `children`
                  comes after this slot, so the page's content won and scrolled
                  over the frozen bar. Isolating the content column instead
                  (isolation:isolate) would have fixed that too, but it would
                  also trap those fixed overlays underneath the bar - they are
                  rendered in place, not portaled to <body>. */}
              <div ref={setTitleBarSlot} className="sticky top-0 z-[45]">
                {!hasCustomTitleBar && <HrTitleBarFallback />}
              </div>
              {previewingOtherModule ? <HrModuleGhost module={selectedModule} /> : children}
            </HrConsoleContextProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
