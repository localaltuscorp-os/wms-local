import { headers } from "next/headers";
import { LayoutGrid } from "lucide-react";
import { LiveIndicator } from "./live-indicator";
import { MainNavServer } from "./main-nav-server";
import { NavHistoryButtons } from "./nav-history-buttons";
import { MobileMenuServer } from "./mobile-menu-server";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { GlobalSearch } from "@/components/header/global-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getCurrentEmployee } from "@/lib/auth/current";
import { workspaceForPath, WORKSPACE_LANDING } from "@/lib/workspaces";

/**
 * Light glassy application header — single row, ~72px tall.
 *
 * Cyan triangle mark + bold "Altus Corp" wordmark on the left, primary
 * nav centered with airy spacing, right cluster carries live indicator +
 * actions + avatar. Frosted-glass white surface with a single hairline
 * bottom border — no decorative washes, no rainbow strip. The nav-pill
 * colors flip to ink-on-light via `.header-light` scope.
 *
 * `generatedAt` is accepted to keep the prop contract stable for callers
 * but no longer rendered.
 */
export async function DashboardHeader({
  generatedAt: _generatedAt,
}: { generatedAt: Date }) {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;

  const pathname = (await headers()).get("x-pathname") ?? "/";
  const ws = workspaceForPath(pathname);

  // Sir's "left → right" layout: EVERY module — WMS included (2026-07) — now uses
  // the vertical LEFT-RAIL (DashboardSidebar) rendered by the (app) layout. This
  // per-page horizontal header is therefore retired for all workspaces; it stays
  // as a no-op only because WMS pages still import & place it. Renders nothing.
  if (ws) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 header-light">
      <div
        className="relative"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <div className="relative w-full h-[96px] px-6 max-md:h-[72px] max-md:px-4 flex items-center gap-4 2xl:gap-6 max-md:gap-3">
          {/* LEFT-MOST: Back / Forward history pills (md+ only).
              On mobile, replaced by the hamburger menu (same slot). */}
          <NavHistoryButtons />
          <MobileMenuServer isAdmin={isAdmin} />

          {/* LEFT: Altus Corp logo — clicking it ANYWHERE in the system returns
              to the Hub (the workspace switchboard). ONLY on the Hub itself does
              the logo go out to altuscorp.in (see app/(app)/hub/page.tsx). */}
          <a href="/hub" className="flex items-center shrink-0" aria-label="Back to Hub">
            <img
              src="/logo.png"
              alt="Altus Corp"
              className="h-16 w-auto max-md:h-14"
              style={{ display: "block" }}
            />
          </a>

          {/* Explicit "Back to Hub" — black, always visible, on every module so
              there's a clear, consistent way back to the workspace switchboard. */}
          <a
            href="/hub"
            aria-label="Back to Hub"
            className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] hover:brightness-125 max-md:px-3 max-md:py-2"
            style={{ background: "#000", color: "#fff", boxShadow: "0 6px 16px -8px rgba(0,0,0,0.45)" }}
          >
            <LayoutGrid size={17} strokeWidth={2.4} />
            <span>Back to Hub</span>
          </a>

          {/* Primary pill nav (unreachable — see the early return above). */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll max-md:hidden">
            <div className="flex w-max">
              <MainNavServer />
            </div>
          </div>

          {/* RIGHT: search + live indicator + actions + avatar. */}
          <div className="flex items-center gap-2.5 2xl:gap-3 shrink-0 max-xl:ml-auto max-md:gap-1.5">
            <GlobalSearch workspace={ws} />
            <span className="max-2xl:hidden">
              <LiveIndicator />
            </span>
            {/* This header only ever renders on the HUB (the early return above
                bails for every workspace), and ChromeShell deliberately passes
                no topBar there — so without this the hub would be the one
                surface with no + at all. Sits between search and the avatar,
                the same slot it occupies in AppTopBar. */}
            <NewTaskQuickAction />
            {/* Notifications — far right, on EVERY screen in EVERY module. */}
            <NotificationBell />
            <UserMenuServer />
          </div>
        </div>
      </div>
    </header>
  );
}
