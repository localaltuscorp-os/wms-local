import { LiveIndicator } from "./live-indicator";
import { MainNavServer } from "./main-nav-server";
import { NavHistoryButtons } from "./nav-history-buttons";
import { MobileMenuServer } from "./mobile-menu-server";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskTrigger } from "@/components/header/new-task-trigger";
import { AdminPill } from "@/components/header/admin-pill";
import { GlobalSearch } from "@/components/header/global-search";
import { getCurrentEmployee } from "@/lib/auth/current";

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

          {/* LEFT: Altus Corp logo. The image is the brand mark — no
              accompanying text wordmark, the logo already includes the name. */}
          <a href="/" className="flex items-center shrink-0" aria-label="Altus Corp home">
            <img
              src="/logo.png"
              alt="Altus Corp"
              className="h-16 w-auto max-md:h-14"
              style={{ display: "block" }}
            />
          </a>

          {/* CENTER: primary pill nav — visible on every desktop width (and
              under zoom). It stays centred while it fits; when space gets tight
              it scrolls horizontally FROM THE LEFT (w-max + mx-auto) so pills
              are never clipped, never overlap, and never disappear. Collapses
              to the hamburger drawer only on real phones (max-md). */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll max-md:hidden">
            <div className="flex w-max mx-auto">
              <MainNavServer />
            </div>
          </div>

          {/* RIGHT: search + live indicator + actions + avatar. Every item is
              shrink-0; secondary chrome (Live / Admin pill) hides below 2xl and
              the search collapses to an icon there too, so the nav always has
              room and nothing ever overlaps. */}
          <div className="flex items-center gap-2.5 2xl:gap-3 shrink-0 max-xl:ml-auto max-md:gap-1.5">
            <GlobalSearch />
            <span className="max-2xl:hidden">
              <LiveIndicator />
            </span>
            <NewTaskTrigger />
            {isAdmin && (
              <span className="max-2xl:hidden">
                <AdminPill />
              </span>
            )}
            <UserMenuServer />
          </div>
        </div>
      </div>
    </header>
  );
}
