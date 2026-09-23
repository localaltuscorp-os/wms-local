"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";
import { archiveRailFor } from "@/lib/archive/sections";
import { MainNavPill } from "./main-nav-pill";
import { FolderArchive } from "lucide-react";
import type { Route } from "next";
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
  //
  // `sidebar-new-task`, NOT `sidebar-collapsible-hide`. That class is
  // `display: none` on a collapsed rail (app/globals.css), which deleted the
  // one ACTION in the sidebar the moment anyone minimised it — every nav pill
  // survived the collapse as an icon and the primary button did not, so the
  // only way to start a task from a collapsed rail was to know the N shortcut.
  // It now shrinks to a centred 40px + tile the same way the nav pills shrink
  // to their glyphs; the collapsed rules live beside theirs.
  return <div className="mt-3 flex flex-col sidebar-new-task">{children}</div>;
}

/** Personal | Professional space toggle — Goals room, ADMINS only. */
export function SidebarGoalsSpace({ isAdmin }: { isAdmin: boolean }): React.JSX.Element | null {
  const ws = workspaceForPath(usePathname() ?? "/");
  if (ws !== "goals" || !isAdmin) return null;
  return <GoalsSpaceToggle />;
}

/**
 * ARCHIVE — pinned at the bottom of every room's rail, above the profile /
 * logout bar (Sir, 2026-09). It is the door to that room's past-employee
 * records: "Archive Tasks" in WMS, "Archive Goals" in Goals, and a plain
 * "Archive" where the room owns several sections (Employees has five).
 *
 * NOT a WORKSPACE_NAV item. Those pills render inside the scrolling nav list,
 * where a rail with fifteen entries would push the Archive off the bottom of
 * the viewport — the one place Sir asked for it to always be. It lives in the
 * pinned foot instead and derives its destination the same route-reactive way
 * the rest of this file does (bug #24), so switching rooms re-aims it.
 *
 * ADMINS ONLY, matching the pages themselves (they redirect anyone else). The
 * flag is passed in from the server; the guard on each page is the boundary.
 */
export function SidebarArchive({ isAdmin }: { isAdmin: boolean }): React.JSX.Element | null {
  const pathname = usePathname() ?? "/";
  const ws = workspaceForPath(pathname);
  if (!isAdmin) return null;
  const { href, label } = archiveRailFor(ws);
  const active = pathname === "/archive" || pathname.startsWith("/archive/");
  return (
    <div className="mb-2 flex flex-col">
      <MainNavPill
        href={href as Route}
        label={label}
        Icon={FolderArchive}
        active={active}
        variant="drawer"
      />
    </div>
  );
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
