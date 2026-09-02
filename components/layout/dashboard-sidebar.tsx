import { cookies } from "next/headers";
import { SidebarRail, SidebarToggle } from "./sidebar-rail";
import { SidebarBrand } from "./sidebar-brand";
import { MainNavServer } from "./main-nav-server";
import { NavHistoryButtons } from "./nav-history-buttons";
import { MobileMenuServer } from "./mobile-menu-server";
import { MobileModuleLabel, SidebarNewTask, SidebarSearch, SidebarGoalsSpace } from "./sidebar-route-chrome";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskRailButton } from "@/components/tasks/new-task-rail-button";
import { NotificationBell } from "@/components/header/notification-bell";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { getCurrentEmployee } from "@/lib/auth/current";

/**
 * Vertical LEFT-RAIL navigation (Sir's "left → right" layout, used by every
 * module except WMS). It carries EVERY detail the top header has, stacked:
 * history · logo → module identity · Back to Hub · search · the primary nav
 * (reusing MainNav's `drawer` variant of full-width vertical pills) · then Live
 * + user menu pinned to the bottom.
 *
 * COLOUR POLICY (Sir): the module colour is reserved for IDENTITY only — the
 * module title/wordmark here + the module names on the hub. Everything else,
 * including the nav pills (which are "buttons"), uses the brand Altus red. So we
 * DON'T override the pill `--vp-cyan*` vars (they default to Altus red); only the
 * wordmark is always the Altus brand red (hub cards alone keep module colours).
 */
export async function DashboardSidebar() {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;

  // bug #24 — no server `x-pathname` read here: the shared layout renders once,
  // so anything derived from it freezes after a soft navigation. All the
  // route-dependent chrome (search scope, New-Task slot, mobile module label)
  // lives behind the usePathname() client wrappers in sidebar-route-chrome.tsx.
  // Collapsed state persists in a cookie so the server renders the right width
  // on first paint (no flicker); the client toggle updates both.
  const collapsed = (await cookies()).get("sidebar_collapsed")?.value === "1";

  return (
   <>
    {/* Mobile (< md): the rail is hidden, so give phones a slim top bar with the
        hamburger drawer (same nav). The (app) layout offsets content with pt. */}
    <div
      className="md:hidden fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 px-4 header-light"
      style={{
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      <MobileMenuServer isAdmin={isAdmin} />
      <a href="/hub" aria-label="Back to Hub" className="shrink-0">
        <img src="/logo.png" alt="Altus Corp" className="h-8 w-auto" />
      </a>
      <MobileModuleLabel />
      {/* Far right on phones too. The desktop AppTopBar is `max-md:hidden` — a
          second 56px strip would eat a third of a small screen — so the bell
          rides in this bar instead. */}
      {/* Same create-then-notify pair as the desktop AppTopBar. That bar is
          `max-md:hidden`, so without this the global + would simply not exist
          on a phone. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <NewTaskQuickAction />
        <NotificationBell />
      </div>
    </div>

    {/* Desktop (md+): the left rail — an IN-FLOW flex child (sticky, full height),
        so page content is offset by its real width and can NEVER slide under it.
        SidebarRail owns the collapse toggle + width; the icon-only look is CSS
        keyed off its data-collapsed (globals.css). */}
    <SidebarRail defaultCollapsed={collapsed}>
      {/* ── Brand block: history · logo · module identity ── */}
      <div className="sidebar-brand flex flex-col gap-3 px-4 pt-4 pb-3">
        {/* Top control row: history + search (hidden when collapsed) with the
            collapse toggle pinned to the right, beside the search. When collapsed,
            only the toggle remains (centered via the sidebar-toprow CSS). */}
        <div className="sidebar-toprow flex items-center gap-2">
          <div className="sidebar-collapsible-hide flex min-w-0 flex-1 items-center gap-2">
            <NavHistoryButtons />
            <SidebarSearch />
          </div>
          <SidebarToggle />
        </div>

        {/* Logo + module wordmark — CLIENT-reactive (usePathname) so the identity
            tracks the current route on soft nav, not the stale server x-pathname. */}
        <SidebarBrand />
      </div>

      {/* The standalone "Back to Hub" pill used to sit here. It's gone — the
          brand block above (logo + module wordmark) IS the link to /hub now,
          so the rail doesn't carry the same navigation twice. */}

      {/* Personal | Professional space switch — Goals room, admins only. */}
      <SidebarGoalsSpace isAdmin={isAdmin} />

      <div className="mx-4 mb-1 border-t" style={{ borderColor: "var(--color-hairline)" }} />

      {/* ── Primary nav — vertical pills (MainNav drawer variant), scrollable ── */}
      <nav aria-label="Primary" className="sidebar-nav nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <MainNavServer variant="drawer" />
        {/* The rail's New Task button is WMS-only furniture; the client wrapper
            shows it only on WMS routes. The DIALOG it opens no longer lives
            here — it is mounted once at the (app) layout root, so the global
            header + can reach it from every module. */}
        <SidebarNewTask>
          <NewTaskRailButton />
        </SidebarNewTask>
      </nav>

      {/* ── Bottom: full-width profile bar (avatar + name + ▲ to open the menu),
          pinned. Replaces the old Live indicator + bare avatar. ── */}
      <div
        className="sidebar-foot mt-auto border-t px-3 py-3"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        <UserMenuServer variant="rail" />
      </div>
    </SidebarRail>
   </>
  );
}
