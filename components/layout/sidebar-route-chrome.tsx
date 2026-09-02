"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";
import { GlobalSearch } from "@/components/header/global-search";
import { GoalsSpaceToggle } from "@/components/goals/board/goals-space-toggle";

/**
 * bug #24 — route-REACTIVE sidebar chrome. The shared (app) layout renders the
 * rail once per server pass and used to freeze `x-pathname` into the search
 * scope, the WMS-only New-Task slot and the mobile module label — after a soft
 * navigation (e.g. Goals → WMS via the nav pills) all three kept describing the
 * PREVIOUS module. Same cure as SidebarBrand: derive the workspace from
 * `usePathname()` client-side so the chrome tracks every navigation.
 */

/** Search scoped to the module the user is LOOKING at, not the one they loaded. */
export function SidebarSearch(): React.JSX.Element {
  const ws = workspaceForPath(usePathname() ?? "/");
  return <GlobalSearch workspace={ws} />;
}

/**
 * Gate for the WMS-only New Task action. The trigger itself stays a SERVER
 * component (it resolves the current employee), so it's passed in as children
 * and this wrapper only decides visibility per route.
 */
export function SidebarNewTask({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const ws = workspaceForPath(usePathname() ?? "/");
  if (ws !== "wms") return null;
  // `flex-col`, not `justify-center`: this sits inside the same `.sidebar-nav`
  // as the nav pills, so stretching it makes New Task exactly as wide as the
  // Dashboard pill above it. `justify-center` sized the wrapper to the button's
  // own content instead, which is why it read narrower than the rail's nav —
  // the button already carries `w-full`, it just had nothing to fill.
  return <div className="mt-3 flex flex-col sidebar-collapsible-hide">{children}</div>;
}

/** Personal | Professional space toggle — Goals room, ADMINS only. */
export function SidebarGoalsSpace({ isAdmin }: { isAdmin: boolean }): React.JSX.Element | null {
  const ws = workspaceForPath(usePathname() ?? "/");
  if (ws !== "goals" || !isAdmin) return null;
  return <GoalsSpaceToggle />;
}

/** The mobile top-bar module label (module colour = identity only). */
export function MobileModuleLabel(): React.JSX.Element | null {
  const ws = workspaceForPath(usePathname() ?? "/");
  const theme = ws && ws !== "wms" ? MODULE_THEME[ws] : null;
  if (!theme) return null;
  return (
    <span className="font-extrabold tracking-tight" style={{ color: "var(--color-altus-red-deep, #A80400)", fontSize: 16 }}>
      {theme.label}
    </span>
  );
}
