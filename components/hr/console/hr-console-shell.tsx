"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { HR_CONSOLE_MODULES, locateHrRoute } from "@/lib/hr/console-nav";
import { cn } from "@/lib/utils";
import { HrModuleRail } from "./hr-module-rail";
import { HrStepList } from "./hr-step-list";
import { HrConsoleContextProvider } from "./hr-console-context";
import { HrModuleGhost } from "./hr-module-ghost";

/**
 * The HR workspace — a three-column console wrapping every /hr surface:
 *
 *   module rail (256px) │ steps (320px) │ the page itself
 *
 * The middle column (HrStepList) lists the selected module's steps/letters as a
 * vertical list, so a letter is one click away. It was briefly replaced by a
 * horizontal quick-access nav pinned under the top bar; that bar is gone and the
 * column is back, with its own collapse toggle beside the rail's.
 *
 * Applied from app/(app)/hr/layout.tsx, so `children` is the real Next.js page
 * for the current route and the console never renders placeholder content. The
 * global search + notification bar is not BUILT here — the (app) layout still
 * constructs the one AppTopBar every route shares — but it is RENDERED here,
 * as the first row of the CONTENT column, because this shell owns the rail
 * beside it. See components/layout/inset-top-bar.tsx for why it is handed down
 * rather than drawn above the whole shell.
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
  // Two independently collapsible columns. The steps list is a real column again
  // (see below), so it gets its own toggle beside the rail's.
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [stepsCollapsed, setStepsCollapsed] = React.useState(false);



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
      // The viewport MINUS the full-width top bar. The bar is now a sibling ABOVE
      // this shell (rendered by ChromeShell, same as every other module), so this
      // shell must take the remaining height or the page would overflow.
      //
      // NO `flex-1` HERE, EVER. This is a flex ITEM (app/(app)/template.tsx is
      // a flex column between us and ChromeShell's min-h-dvh frame). `flex-1`
      // sets `flex-basis: 0%`, and on a flex item the basis REPLACES the main-
      // size property — so the height below would be silently ignored and the
      // shell would size to its content instead. With the default
      // `flex-basis: auto` the height is used.
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

      {/* THE STEP LIST — column 2, the module's letters/forms as a vertical list
          so a letter is one click away without hunting the horizontal bar. When
          collapsed it is 0-wide and a slim expander sits beside the rail. */}
      {!stepsCollapsed && (
        <div className="max-lg:hidden">
          <HrStepList
            module={selectedModule}
            activeHref={previewingOtherModule ? null : (located.subModule?.href ?? null)}
            onCollapse={() => setStepsCollapsed(true)}
          />
        </div>
      )}
      {stepsCollapsed && (
        <button
          type="button"
          onClick={() => setStepsCollapsed(false)}
          aria-label="Show steps"
          title="Show steps"
          className="my-2 shrink-0 rounded-r-lg border border-l-0 border-hairline bg-surface-card px-1.5 py-2 text-ink-muted transition-colors hover:text-ink max-lg:hidden"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The CONTENT column: the page itself. The full-width top bar lives
            above this shell (ChromeShell), and the steps live in column 2
            (HrStepList above), so the page is the only thing here. */}
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
