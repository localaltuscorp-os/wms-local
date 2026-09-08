"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { GlobalSearch } from "@/components/header/global-search";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { FocusModeToggle } from "@/components/layout/focus-mode-toggle";
import { workspaceForPath } from "@/lib/workspaces";

/**
 * The app-wide TOP BAR — one persistent strip across the content column on every
 * screen in every module.
 *
 * Why it exists: search used to be a 40×40 icon button tucked into the left
 * rail's top row, and the unread count lived only inside the user-menu dropdown.
 * Neither read as a permanent, findable place. This bar gives both a fixed home:
 * a WIDE global-search field on the left and the notification bell pinned far
 * right.
 *
 * The field says "Global search" in as many words. Every page-level search box
 * says "Local search" and names what it filters — the two were previously
 * indistinguishable magnifying glasses, so nobody could tell which one would
 * leave the page.
 *
 * DESKTOP ONLY (`max-md:hidden`). Phones already carry a fixed 56px bar from
 * DashboardSidebar; a second one would eat a third of a small screen, so the
 * bell is rendered into THAT bar instead and search stays in the rail drawer.
 *
 * Sticky at `top: 0` with `--app-topbar-h` published for everything below it.
 * Page-level sticky headers (the dashboard filter bar, the HR page headers) read
 * that variable so they pin BENEATH this bar instead of underneath it.
 * `PageCommandBar` needs no such wiring — it measures pinned ancestors at
 * runtime and picks this up on its own.
 *
 * `bell` is server-rendered (it queries the unread count) and passed in as a
 * prop, the same arrangement ChromeShell already uses for the sidebar.
 */
export function AppTopBar({ bell }: { bell?: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const ws = workspaceForPath(pathname);

  return (
    <div
      className="app-topbar sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-6 max-lg:px-4 max-md:hidden"
      style={{
        borderColor: "var(--color-hairline)",
        backgroundColor: "rgba(255,255,255,0.86)",
        backdropFilter: "blur(18px) saturate(150%)",
        WebkitBackdropFilter: "blur(18px) saturate(150%)",
      }}
    >
      {/* Global search — a real field, not an icon. Capped so it stays a search
          box rather than stretching to the full width of a 2560px monitor. */}
      <div className="min-w-0 max-w-[520px] flex-1">
        <GlobalSearch
          workspace={ws}
          trigger={
            <button
              type="button"
              aria-label="Global search"
              title="Global search (⌘K)"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-hairline-strong bg-surface-soft px-3 text-left text-ink-subtle transition-colors hover:border-[color:var(--color-altus-red)] hover:bg-surface-card"
            >
              <Search size={16} strokeWidth={2.3} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                Global search
                <span className="ml-1 font-medium text-ink-subtle max-lg:hidden">
                  - tasks, clients, people, documents…
                </span>
              </span>
              <kbd className="shrink-0 rounded border border-hairline-strong bg-surface-card px-1.5 py-0.5 text-[10.5px] font-bold text-ink-subtle max-lg:hidden">
                ⌘K
              </kbd>
            </button>
          }
        />
      </div>

      {/* FAR RIGHT — create, then notifications. `ml-auto` keeps the cluster
          pinned to the edge no matter how wide the search field ends up.

          The + sits immediately LEFT of the bell: creating a task is an action
          the user initiates, the bell is a thing that interrupts them, and the
          action reads first in that pair. It used to live in the WMS
          dashboard's Task Summary header, where it was reachable from one
          section of one page and vanished when that section was collapsed. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <NewTaskQuickAction />
        {/* Focus mode sits between the + and the bell. The + is the action the
            user came to take and keeps its place; this changes how the whole
            surface is PRESENTED, which is chrome — so it belongs with the
            chrome, not ahead of the primary action. */}
        <FocusModeToggle />
        {bell}
      </div>
    </div>
  );
}
