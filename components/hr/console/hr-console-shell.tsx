"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { HR_CONSOLE_MODULES, locateHrRoute } from "@/lib/hr/console-nav";
import { cn } from "@/lib/utils";
import { HrModuleRail } from "./hr-module-rail";
import { HrStepNav } from "./hr-step-nav";
import { HrConsoleContextProvider } from "./hr-console-context";
import { HrModuleGhost } from "./hr-module-ghost";

/**
 * The HR workspace — a two-column console wrapping every /hr surface:
 *
 *   module rail (256px) │ the page itself
 *
 * The module's steps used to be a third column, a 320px sidebar between the
 * two. They are now a horizontal QUICK-ACCESS NAV (HrStepNav) pinned at the top
 * of the content column instead — same links, one row, and no column of its own
 * to collapse, which is why the collapse control and its shared state are gone.
 *
 * Applied from app/(app)/hr/layout.tsx, so `children` is the real Next.js page
 * for the current route and the console never renders placeholder content. The
 * global search + notification bar is NOT repeated here — the app's own
 * AppTopBar already sits above this shell on every route.
 *
 * The step nav is driven by a SELECTED module, seeded from (and re-synced to)
 * the current route: browsing the rail previews another module's steps, but
 * landing on a new route always re-points it at that route's own module.
 *
 * A page's TITLE no longer lives in this column at all — <HrTitleBar> portals it
 * into the app's global top bar (see page-chrome-slots.tsx). What stays pinned
 * here is the step nav alone.
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
  // Only the rail collapses now. The steps had a second, independent toggle
  // while they were a column; as a row of buttons there is nothing to collapse.
  const [railCollapsed, setRailCollapsed] = React.useState(false);



  const located = React.useMemo(() => locateHrRoute(pathname), [pathname]);
  const activeModuleId = located.module?.id ?? null;

  const [selectedModuleId, setSelectedModuleId] = React.useState<string | null>(activeModuleId);
  // Follow the route: a soft navigation into another module re-points column 2.
  React.useEffect(() => {
    if (activeModuleId) setSelectedModuleId(activeModuleId);
  }, [activeModuleId]);

  // Picking a module in the rail points the step nav at it immediately, ahead
  // of the navigation that the rail row (a real link) also kicks off.
  const selectModule = React.useCallback((id: string) => {
    setSelectedModuleId(id);
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
      routeTitle,
    }),
    [selectedModule, routeTitle],
  );

  return (
    <div
      // `hr-shell` / `hr-shell-scroll` are PRINT HOOKS, not styling. This shell
      // pins itself to the viewport and scrolls internally, which is right on
      // screen and fatal on paper: the printed document was clipped to a single
      // ~848px page with this pane's scrollbar painted down its side.
      // globals.css unclips both under @media print. Keep the class names.
      className="hr-shell flex overflow-hidden bg-canvas-base"
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
        {/* flex-col: the step-nav row stacks ABOVE the scrolling content column
            (it was a single row holding the old steps sidebar + the scroller). */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          <HrConsoleContextProvider value={consoleContext}>
            {/* THE STEP NAV SITS OUTSIDE THE SCROLLER, as its own row.
                It used to be `sticky top-0` INSIDE the scroll container, which
                looked the same but measured differently: the nav then occupied
                the top of the scrolling flow, so a page asking for `min-h-full`
                got the FULL container height starting BELOW the nav and
                overflowed by exactly the nav's height. That is what pushed the
                module's centred pane down by ~45px while the same pane sat dead
                centre on /hr, where there is no nav. As a flex row above the
                scroller it is still permanently visible, and the space below it
                is now honestly 100% of what a page can use.

                Z-INDEX BAND - page code must respect both sides of it:
                  <= z-40   in-flow page content (cards, their dropdowns).
                  z-45      this row.
                  >= z-50   `fixed inset-0` overlays - the letter, policy and
                            assessment modals, which MUST paint over it. */}
            <div className="z-[45] shrink-0">
              <HrStepNav
                module={selectedModule}
                activeHref={previewingOtherModule ? null : (located.subModule?.href ?? null)}
              />
            </div>
            <div
              className="hr-shell-scroll min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas-base"
              style={{ "--app-topbar-h": "0px" } as React.CSSProperties}
            >
              {previewingOtherModule ? <HrModuleGhost module={selectedModule} /> : children}
            </div>
          </HrConsoleContextProvider>
        </div>
      </div>
    </div>
  );
}
