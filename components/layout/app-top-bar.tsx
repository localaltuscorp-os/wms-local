"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { GlobalSearch } from "@/components/header/global-search";
import { navTitleFor } from "@/components/layout/main-nav";
import { MODULE_THEME } from "@/lib/module-theme";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { FocusModeToggle } from "@/components/layout/focus-mode-toggle";
import { workspaceForPath } from "@/lib/workspaces";

/**
 * The app-wide TOP BAR — one persistent strip across the content column on every
 * screen in every module.
 *
 * Why it exists: search used to be an icon button tucked into the left rail's
 * top row, and the unread count lived only inside the user-menu dropdown.
 * Neither read as a permanent, findable place. This bar gives both a fixed
 * home, in one right-hand cluster: search · create · focus · bell.
 *
 * SEARCH IS AN ICON, not a field. It spent a while as a wide labelled box here
 * — the label existed to separate it from the page-level "Local search" boxes,
 * which name what they filter. That distinction now rests on POSITION instead:
 * global search lives in the top bar's cluster on every screen, local search
 * lives in the page's own header. The wording survives inside the dialog.
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

  /* WHERE AM I. The bar's left side was empty once global search became an
     icon, and "empty" is a waste of the one strip that is on every screen in
     every module. The page name goes there.

     Three sources, in order of how specific they are:
       1. the rail item that owns this path  ("Daily Goals", "Aging Heatmap")
       2. the module, for a page no rail item covers ("WMS", "Goals")
       3. "Altus", for the hub and anything outside a module
     Never a raw slug — a header that reads "people-allocation" is worse than
     no header. */
  const moduleLabel = ws ? MODULE_THEME[ws].label : undefined;
  const title = navTitleFor(pathname) ?? moduleLabel ?? "Altus";

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
      {/* THE PAGE NAME. `truncate` + `min-w-0` so a long title gives way to the
          controls rather than pushing them off the bar. `<h1>` because on most
          of these pages it genuinely is the page's heading — the dashboard and
          the task list have no other one. */}
      {/* `topbar-heading` (app/globals.css) is the RAIL WORDMARK'S OWN TYPE —
          the same display face at 900, the same brand-red gradient and the same
          sheen, shared from one declaration rather than restated here. This bar
          and the rail's module mark are the two fixed things on every screen in
          every module, they sit ~200px apart, and until now one was a brand
          mark and the other was 17px of grey-black UI text. */}
      <h1 className="topbar-heading min-w-0 truncate">{title}</h1>

      {/* FAR RIGHT — search, create, focus, notifications. `ml-auto` pins the
          cluster to the edge; the rest of the bar is deliberately empty.

          SEARCH IS AN ICON NOW, sitting immediately left of the +. It used to
          be a 520px field on the left of this bar, which said "Global search —
          tasks, clients, people, documents…" in as many words. That wording is
          not lost: it is the placeholder inside the dialog this opens, where it
          is read at the moment it matters instead of occupying the top of every
          screen in the app. The ⌘K hint moves to the button's tooltip for the
          same reason.

          The + keeps its place: creating a task is the action the user came to
          take, the bell is a thing that interrupts them, and the action reads
          first in that pair. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <GlobalSearch
          workspace={ws}
          trigger={
            <button
              type="button"
              aria-label="Global search"
              title="Global search — tasks, clients, people, documents (⌘K)"
              // Same 36px square, same radius and the same hover as the focus
              // toggle beside it, so the four controls read as one cluster
              // rather than as a search box that happened to shrink.
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Search className="size-5" strokeWidth={2.2} />
            </button>
          }
        />
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
