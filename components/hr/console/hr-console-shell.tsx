"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { HR_CONSOLE_MODULES, locateHrRoute } from "@/lib/hr/console-nav";
import { visibleConsoleModules } from "@/lib/hr/console-visibility";
import { cn } from "@/lib/utils";
import { HrModuleRail } from "./hr-module-rail";
import { HrConsoleContextProvider } from "./hr-console-context";

const HR_RAIL_DEFAULT_WIDTH = 228;
const HR_RAIL_MIN_WIDTH = 200;
const HR_RAIL_MAX_WIDTH = 420;
const HR_RAIL_COLLAPSED_WIDTH = 74;
const HR_RAIL_WIDTH_STORAGE_KEY = "hr-console-rail-width";

function clampRailWidth(value: number): number {
  return Math.min(HR_RAIL_MAX_WIDTH, Math.max(HR_RAIL_MIN_WIDTH, Math.round(value)));
}

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
  hiddenNodes = null,
  children,
}: {
  user: { name: string; role: string };
  /** Catalogue node keys this person has been DENIED (`hiddenModuleKeys()`),
   *  resolved on the server. `null` means "not governed by the matrix" — a
   *  master admin, or somebody the matrix does not cover — and shows everything.
   *
   *  The matrix has been ENFORCED all along (`requirePathView` in the (app)
   *  layout refuses a denied route however it is reached). This is what stops
   *  the console OFFERING one: without it the rail kept drawing steps that
   *  bounced the person to the hub when clicked. */
  hiddenNodes?: string[] | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/hr";

  // The ONE filter, applied to the module list this shell owns. Everything below
  // reads `modules`, never the raw catalogue.
  const modules = React.useMemo(
    () => visibleConsoleModules(HR_CONSOLE_MODULES, hiddenNodes ? new Set(hiddenNodes) : null),
    [hiddenNodes],
  );
  // Two independently collapsible columns. The steps list is a real column again
  // (see below), so it gets its own toggle beside the rail's.
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [railWidth, setRailWidth] = React.useState(HR_RAIL_DEFAULT_WIDTH);
  const [isResizingRail, setIsResizingRail] = React.useState(false);

  // Restore only a valid, user-selected width. The initial default remains
  // server-safe, then the saved client preference lands on the next frame.
  React.useEffect(() => {
    const stored = Number(window.localStorage.getItem(HR_RAIL_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored)) return;
    const frame = window.requestAnimationFrame(() => setRailWidth(clampRailWidth(stored)));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // The top bar is a sibling of this shell, so publish the live rail width on
  // the document root. Its HR-only CSS rule reads the same value, preventing a
  // widened/narrowed rail and page title from drifting apart.
  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--hr-console-rail-width",
      `${railCollapsed ? HR_RAIL_COLLAPSED_WIDTH : railWidth}px`,
    );
  }, [railCollapsed, railWidth]);

  const commitRailWidth = React.useCallback((next: number) => {
    const clamped = clampRailWidth(next);
    setRailWidth(clamped);
    window.localStorage.setItem(HR_RAIL_WIDTH_STORAGE_KEY, String(clamped));
  }, []);

  const startRailResize = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (railCollapsed || event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = railWidth;
    let finalWidth = startWidth;
    setIsResizingRail(true);

    const onMove = (moveEvent: PointerEvent) => {
      finalWidth = clampRailWidth(startWidth + moveEvent.clientX - startX);
      setRailWidth(finalWidth);
    };
    const onEnd = () => {
      setIsResizingRail(false);
      window.localStorage.setItem(HR_RAIL_WIDTH_STORAGE_KEY, String(finalWidth));
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd, { once: true });
    document.addEventListener("pointercancel", onEnd, { once: true });
  }, [railCollapsed, railWidth]);

  const resizeRailWithKeyboard = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (railCollapsed) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitRailWidth(railWidth - 12);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitRailWidth(railWidth + 12);
    } else if (event.key === "Home") {
      event.preventDefault();
      commitRailWidth(HR_RAIL_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      commitRailWidth(HR_RAIL_MAX_WIDTH);
    }
  }, [commitRailWidth, railCollapsed, railWidth]);



  const located = React.useMemo(() => locateHrRoute(pathname), [pathname]);
  const activeModuleId = located.module?.id ?? null;

  const selectedModuleId = activeModuleId;
  // Follow the route: a soft navigation into another module re-points column 2.
  // Picking a module in the rail points the step nav at it immediately, ahead
  // of the navigation that the rail row (a real link) also kicks off.
  const selectModule = React.useCallback(() => {}, []);

  // /hr?open=<stage> preselects that module without navigating into a step —
  // the target of every "Back to <Stage>" button in the room (the old landing
  // page used the same param to re-open its stage pop-up).
  const selectedModule = React.useMemo(
    () => modules.find((m) => m.id === selectedModuleId) ?? null,
    [modules, selectedModuleId],
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
  // The top bar label for wherever we are: the open step, else its module.
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
      // hr-shell / hr-shell-scroll are PRINT HOOKS, not styling. This shell
      // shares the viewport with the two right-column navigation rows and
      // scrolls internally, which is right on
      // screen and fatal on paper: the printed document was clipped to a single
      // ~848px page with this pane's scrollbar painted down its side.
      // globals.css unclips both under @media print. Keep the class names.
      className="hr-shell relative flex overflow-hidden bg-canvas-base"
      // Pull the shell up to the viewport edge so the HR rail occupies the
      // complete left column. The shared module navbar and title ribbon are
      // constrained to the right column by globals.css.
      //
      // NO `flex-1` HERE, EVER. This is a flex ITEM (app/(app)/template.tsx is
      // a flex column between us and ChromeShell's min-h-dvh frame). `flex-1`
      // sets `flex-basis: 0%`, and on a flex item the basis REPLACES the main-
      // size property — so the height below would be silently ignored and the
      // shell would size to its content instead. With the default
      // `flex-basis: auto` the height is used.
      style={{
        height: "100dvh",
        marginTop: "calc(var(--app-topbar-h) * -1)",
      }}
    >
      <div
        className={cn(
          "relative z-[61] shrink-0 overflow-visible max-lg:hidden",
          isResizingRail ? "transition-none" : "transition-[width] duration-300 ease-in-out",
          // Collapsed → a 74px ICON STRIP, not a full hide. The rail's own
          // collapse/expand toggle lives inside HrModuleRail, so hiding this
          // column entirely (w-0) would hide the only control that could bring
          // it back — a self-trapping toggle. The icon strip keeps it reachable,
          // matching how the app's global left sidebar collapses.
          //
          // 74px, not the 64px it was until 2026-09-21: that is the width
          // components/layout/sidebar-rail.tsx uses for every OTHER module, and
          // 64px did not fit /logo.png. The logo is a wide wordmark drawn at
          // h-12 (48px); at 64px minus the brand block's padding there were 32px
          // of room for it, and `overflow-hidden` on this column squashed it.
          // Matching the global rail's width fixes the logo and makes the two
          // rails the same object, which is the point of this whole file.
          //
          // 228px, matching the standard WMS rail: the longest label ("Enterprise
          // Communications") renders ~161px, and the row's fixed chrome — nav
          // padding 16 + button padding 20 + icon 16 + two 10px gaps + the
          // 12px external-link arrow — eats 84px. So the row needs ~245px;
          // 236px truncated it to "Enterprise Communicati…". This leaves ~11px
          // of slack — enough to absorb font-rendering variance without
          // stranding visibly empty rail beside the longest row. The Directory
          // contact table keeps its own horizontal scroll for its many columns.
          railCollapsed ? "w-[74px]" : "",
        )}
        style={{ width: railCollapsed ? HR_RAIL_COLLAPSED_WIDTH : railWidth }}
      >
        <HrModuleRail
          key={activeModuleId ?? "hr"}
          modules={modules}
          collapsed={railCollapsed}
          selectedModuleId={selectedModuleId}
          activeModuleId={activeModuleId}
          activeHref={located.subModule?.href ?? null}
          onSelect={selectModule}
          onToggleRail={() => setRailCollapsed((v) => !v)}
        />
        {!railCollapsed && (
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize HR sidebar"
            aria-valuemin={HR_RAIL_MIN_WIDTH}
            aria-valuemax={HR_RAIL_MAX_WIDTH}
            aria-valuenow={railWidth}
            title="Drag to resize sidebar"
            onPointerDown={startRailResize}
            onKeyDown={resizeRailWithKeyboard}
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-altus-red focus-visible:after:bg-altus-red"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col pt-[var(--app-topbar-h)]">
        {/* The page content starts below the right-column module navbar and
            title ribbon; the left rail remains continuous from the top edge. */}
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
            <div
              className="hr-shell-scroll min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas-base"
              style={{ "--app-topbar-h": "0px" } as React.CSSProperties}
            >
              {children}
            </div>
          </HrConsoleContextProvider>
        </div>
      </div>
    </div>
  );
}
