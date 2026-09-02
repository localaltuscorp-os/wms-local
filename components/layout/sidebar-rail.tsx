"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { workspaceForPath } from "@/lib/workspaces";

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

  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  const expandedWidth = ws === "hr" ? "w-[288px]" : ws === "goals" ? "w-[228px]" : "w-[212px]";

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
  const collapsedRef = React.useRef(collapsed);
  collapsedRef.current = collapsed;
  const priorRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const inHr = workspaceForPath(pathname ?? "/") === "hr";
    const atFrontDoor = pathname === "/hr";
    const KEY = "hr-rail-autocollapsed";
    if (
      atFrontDoor &&
      priorRef.current === null &&
      !userTouchedRef.current &&
      !sessionStorage.getItem(KEY)
    ) {
      sessionStorage.setItem(KEY, "1");
      priorRef.current = collapsedRef.current;
      if (!collapsedRef.current) setCollapsed(true);
    } else if (!inHr && priorRef.current !== null && !userTouchedRef.current) {
      setCollapsed(priorRef.current);
      priorRef.current = null;
    }
  }, [pathname]);

  return (
    <CollapseCtx.Provider value={{ collapsed, toggle }}>
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={`sidebar-rail sticky top-0 z-40 header-light flex h-dvh shrink-0 flex-col max-md:hidden ${collapsed ? "w-[74px]" : expandedWidth}`}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.86)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderRight: "1px solid var(--color-hairline)",
        }}
      >
        {children}
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
