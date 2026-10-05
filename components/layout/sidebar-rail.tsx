"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { workspaceForPath } from "@/lib/workspaces";

const RAIL_MIN_WIDTH = 200;
const RAIL_MAX_WIDTH = 420;
const RAIL_COLLAPSED_WIDTH = 74;

function clampRailWidth(value: number): number {
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(value)));
}

/**
 * The collapsible shell for the module LEFT-RAIL. Owns the collapsed state (client,
 * for instant toggle) and mirrors it to the `sidebar_collapsed` cookie so the
 * SERVER renders the right width on the next navigation — no first-paint flicker.
 * The icon-only collapsed look is pure CSS keyed off `data-collapsed`
 * (globals.css `.sidebar-rail[data-collapsed="true"]`).
 *
 * The collapse/expand toggle is NOT rendered here — it's exposed via context so it
 * can sit up in the brand row beside the search icon (`<SidebarToggle />`).
 */
const CollapseCtx = React.createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebarCollapse() {
  return React.useContext(CollapseCtx);
}

export function SidebarRail({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [railWidth, setRailWidth] = React.useState(228);
  const [isResizing, setIsResizing] = React.useState(false);

  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  // Operations sits between the default and HR: it carries five areas and
  // the longest label in the app ("Monthly Events Master"), which wrapped to
  // two lines at 212px and left the module tile fighting the wordmark for
  // the same row.
  const defaultExpandedWidth =
    ws === "hr"
      ? 288
      : ws === "operations"
        ? 248
        : ws === "productivity"
          ? 248
          : ws === "goals"
            ? 228
          : 228;
  const widthStorageKey = `sidebar-rail-width:${ws ?? "default"}`;

  // Each workspace remembers its own expanded width. The server still renders
  // the standard width; the saved browser preference is applied immediately
  // after hydration, without affecting another module's rail.
  React.useEffect(() => {
    const stored = Number(window.localStorage.getItem(widthStorageKey));
    const next = Number.isFinite(stored) ? clampRailWidth(stored) : defaultExpandedWidth;
    const frame = window.requestAnimationFrame(() => setRailWidth(next));
    return () => window.cancelAnimationFrame(frame);
  }, [defaultExpandedWidth, widthStorageKey]);

  const commitRailWidth = React.useCallback((next: number) => {
    const clamped = clampRailWidth(next);
    setRailWidth(clamped);
    window.localStorage.setItem(widthStorageKey, String(clamped));
  }, [widthStorageKey]);

  const startResize = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = railWidth;
    let finalWidth = startWidth;
    setIsResizing(true);

    const onMove = (moveEvent: PointerEvent) => {
      finalWidth = clampRailWidth(startWidth + moveEvent.clientX - startX);
      setRailWidth(finalWidth);
    };
    const onEnd = () => {
      setIsResizing(false);
      window.localStorage.setItem(widthStorageKey, String(finalWidth));
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd, { once: true });
    document.addEventListener("pointercancel", onEnd, { once: true });
  }, [collapsed, railWidth, widthStorageKey]);

  const resizeWithKeyboard = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (collapsed) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitRailWidth(railWidth - 12);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitRailWidth(railWidth + 12);
    } else if (event.key === "Home") {
      event.preventDefault();
      commitRailWidth(RAIL_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      commitRailWidth(RAIL_MAX_WIDTH);
    }
  }, [collapsed, commitRailWidth, railWidth]);

  // Once the user hits the toggle we stop auto-managing (never fight a manual choice).
  const userTouchedRef = React.useRef(false);
  const toggle = React.useCallback(() => {
    userTouchedRef.current = true;
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return next;
    });
  }, []);

  // HR front door auto-collapse — opening the HR module (the `/hr` front door)
  // collapses the rail to icon-only so the seven lifecycle cards get full width.
  // ONLY for HR, ONLY the first time this browser session (`hr-rail-autocollapsed`),
  // and we restore the prior width the moment you leave the HR module — so no
  // other room is affected and a manual toggle always wins.
  const priorRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const inHr = workspaceForPath(pathname ?? "/") === "hr";
    const atFrontDoor = pathname === "/hr";
    const KEY = "hr-rail-autocollapsed";
    let nextCollapsed: boolean | null = null;
    if (
      atFrontDoor &&
      priorRef.current === null &&
      !userTouchedRef.current &&
      !sessionStorage.getItem(KEY)
    ) {
      sessionStorage.setItem(KEY, "1");
      priorRef.current = collapsed;
      if (!collapsed) nextCollapsed = true;
    } else if (!inHr && priorRef.current !== null && !userTouchedRef.current) {
      nextCollapsed = priorRef.current;
      priorRef.current = null;
    }
    if (nextCollapsed === null) return;
    const timer = window.setTimeout(() => setCollapsed(nextCollapsed), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, collapsed]);

  return (
    <CollapseCtx.Provider value={{ collapsed, toggle }}>
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        /* `aura-rail-skin` carries the material (see app/aura.css) — it used to
           be four inline properties here, which no stylesheet could override
           because inline always wins. The rail is now glass like the top bar
           above it, and the two read as one piece of chrome. */
        className={`sidebar-rail aura-rail-skin relative sticky top-0 z-40 flex h-dvh shrink-0 flex-col header-light max-md:hidden ${isResizing ? "transition-none" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: collapsed ? RAIL_COLLAPSED_WIDTH : railWidth }}
      >
        {children}
        {!collapsed && (
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize module sidebar"
            aria-valuemin={RAIL_MIN_WIDTH}
            aria-valuemax={RAIL_MAX_WIDTH}
            aria-valuenow={railWidth}
            title="Drag to resize sidebar"
            onPointerDown={startResize}
            onKeyDown={resizeWithKeyboard}
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-altus-red focus-visible:after:bg-altus-red"
          />
        )}
      </aside>
    </CollapseCtx.Provider>
  );
}

/** Collapse/expand toggle — placed beside the search icon in the brand row. */
export function SidebarToggle() {
  const { collapsed, toggle } = useSidebarCollapse();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
    >
      {collapsed ? <PanelLeftOpen size={15} strokeWidth={2.3} /> : <PanelLeftClose size={15} strokeWidth={2.3} />}
    </button>
  );
}
