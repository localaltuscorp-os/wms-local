"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ChevronDown, Search } from "lucide-react";
import { GlobalSearch } from "@/components/header/global-search";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { FocusModeToggle } from "@/components/layout/focus-mode-toggle";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";
import { AuraRailToggle } from "@/components/hub/aura-chrome";
import { showsModuleRail } from "@/components/layout/chrome-shell";
import { MODULE_THEME } from "@/lib/module-theme";
import { workspaceForPath, type WorkspaceId } from "@/lib/workspaces";
import type { AuraRoom } from "@/lib/aura-rooms";

/**
 * THE APP-WIDE TOP BAR, in the Aura language — one glass strip on every screen
 * in every module.
 *
 * It replaced a bar that showed the page's name on the left and four icons on
 * the right. The name is gone on purpose: the LEFT RAIL names the page (it
 * highlights the section you are in), so repeating it 200px away spent the one
 * strip that is on every screen on something already said. This bar now does
 * the thing nothing else did — SWITCH ROOMS.
 *
 *   [rail toggle] [Altus] [module tabs · More ▾] [———— search ————] [+ ◑ 🔔 ●]
 *
 * TABS AND "MORE". The tabs are quick access to the first few rooms and drop
 * out one at a time as the bar narrows (see the media queries in aura.css).
 * That is safe only because "More" lists EVERY room the viewer can enter, not
 * just the overflow — an overflow-only menu derived from a width measurement
 * leaves a module unreachable at whatever width the measurement gets wrong.
 * The menu opens on hover, on click and on keyboard focus; hover alone is
 * unusable on a touch screen and unreachable from a keyboard.
 *
 * ACCESS IS RESOLVED ON THE SERVER and handed down as `rooms` — this component
 * never decides who may see what. That is presentation parity with the hub's
 * hidden cards, not the security boundary; the `(app)` layout still bounces a
 * deep link into a room you cannot enter.
 *
 * THE PAGE-CHROME PORTALS SURVIVE. `slots.title` and `slots.actions` are the
 * same two mount points the old bar published, so the HR console's per-page
 * titles and per-page buttons still land here and nothing that portalled into
 * them had to change.
 */

/** How many rooms get a tab. The rest are reachable from "More", as are these. */
const TAB_COUNT = 5;

export function AuraTopBar({
  rooms,
  bell,
  userMenu,
}: {
  rooms: AuraRoom[];
  /** Server-rendered notification bell (it queries the unread count). */
  bell?: React.ReactNode;
  /** Server-rendered account menu. */
  userMenu?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const ws = workspaceForPath(pathname);
  const slots = usePageChromeSlots();

  /* The dashboard is the one route with an Aura workspace rail to collapse, and
     the one route with no `DashboardSidebar` — which means no mobile bar of its
     own either. Both facts are read off the path here rather than plumbed down
     as props, because the `(app)` layout is SHARED and does not re-run on a soft
     navigation: a prop decided up there would freeze on the first page landed. */
  const onDashboard = pathname === "/hub";

  /* The module rail carries the account menu in its foot. Where the rail is
     showing, the bar leaves identity to it rather than putting a second copy
     200px away; where it is not — the dashboard, the HR console — the bar is
     the only place identity can live, so it shows it. One predicate, shared
     with ChromeShell, so the two can never disagree about which is which. */
  const railHasIdentity = showsModuleRail(pathname);

  /* The first TAB_COUNT rooms get tabs — except that the room you are IN always
     does, even when it sits past the cut. A bar whose active tab is invisible
     tells you less than no tabs at all. */
  const tabs = React.useMemo(() => {
    const head = rooms.slice(0, TAB_COUNT);
    if (!ws || head.some((r) => r.id === ws)) return head;
    const current = rooms.find((r) => r.id === ws);
    return current ? [...head.slice(0, TAB_COUNT - 1), current] : head;
  }, [rooms, ws]);

  return (
    // Phones already carry a fixed 56px bar from DashboardSidebar, so off the
    // dashboard this one hides rather than eating a third of a small screen.
    <header className={onDashboard ? "aura-topbar app-topbar" : "aura-topbar app-topbar max-md:hidden"}>
      {onDashboard && <AuraRailToggle />}

      <a
        href="/hub"
        aria-label="Altus — back to the dashboard"
        className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80"
      >
        <Image src="/logo.png" alt="" width={170} height={188} priority className="h-8 w-auto" />
        <span className="aura-brand max-lg:hidden">Altus</span>
      </a>

      {/* A page's OWN title, portaled in (the HR console names itself more
          precisely than its route can be read). `empty:hidden` so it costs no
          space on the pages that set none. */}
      <div ref={slots?.setTitle} className="flex min-w-0 items-center empty:hidden" />

      <nav className="aura-tabs" aria-label="Workspaces">
        {tabs.map((r) => (
          <a
            key={r.id}
            href={r.href as Route}
            className="aura-tab"
            {...(ws === r.id ? { "aria-current": "page" as const } : {})}
            onClick={() => setActiveWorkspaceCookie(r.id)}
          >
            <span className="aura-tab-dot" style={{ background: r.accent }} aria-hidden />
            {r.label}
          </a>
        ))}
        <MoreMenu rooms={rooms} current={ws} />
      </nav>

      <div className="aura-search-slot">
        <GlobalSearch
          workspace={ws}
          trigger={
            <button type="button" className="aura-searchbox" aria-label="Search the whole app">
              <Search size={15} strokeWidth={2.2} aria-hidden />
              <span>Search tasks, clients, people, documents</span>
              <span className="aura-kbd" aria-hidden>
                ⌘K
              </span>
            </button>
          }
        />
      </div>

      {/* A page's OWN controls (a print button, an edit link), immediately left
          of the global cluster — the same slot the previous bar published. */}
      <div ref={slots?.setActions} className="flex shrink-0 items-center gap-2 empty:hidden" />

      <div className="flex shrink-0 items-center gap-2">
        <NewTaskQuickAction />
        <FocusModeToggle />
        {bell}
        {!railHasIdentity && userMenu}
      </div>
    </header>
  );
}

/**
 * Mirrors what `EnterWorkspaceLink` does on the hub: stamp the active-workspace
 * cookie so the room you land in agrees with the one the chrome thinks you are
 * in. Same name, path, age and SameSite as the `/ws/<id>` handler sets.
 */
function setActiveWorkspaceCookie(id: WorkspaceId): void {
  document.cookie = `aw=${id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

/**
 * The "More" menu — every room, with its colour, its tagline and the digit that
 * opens it.
 *
 * Open on hover, on click, and whenever anything inside has keyboard focus.
 * The close is delayed ~120ms so the diagonal mouse path from the button to the
 * first item does not dismiss the thing you are reaching for.
 */
function MoreMenu({ rooms, current }: { rooms: AuraRoom[]; current: WorkspaceId | null | undefined }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = React.useRef<HTMLDivElement>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  // Escape closes it, and a click anywhere else does too — a menu that can only
  // be dismissed by finding your way back to its button is a trap.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (rooms.length === 0) return null;

  return (
    <div
      ref={wrap}
      className="aura-more"
      data-open={open ? "true" : "false"}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="aura-tab"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        More
        <ChevronDown size={13} strokeWidth={2.4} aria-hidden />
      </button>

      <div className="aura-glass aura-more-panel" role="menu" aria-label="All workspaces">
        <div className="aura-more-label">ALL WORKSPACES</div>
        {rooms.map((r) => {
          const Icon = MODULE_THEME[r.id].Icon;
          return (
            <a
              key={r.id}
              role="menuitem"
              href={r.href as Route}
              className="aura-more-item"
              {...(current === r.id ? { "aria-current": "page" as const } : {})}
              onClick={() => {
                setActiveWorkspaceCookie(r.id);
                setOpen(false);
              }}
            >
              <span className="aura-more-icon">
                <Icon size={15} strokeWidth={1.9} style={{ color: r.accentDeep }} aria-hidden />
              </span>
              <span className="aura-more-text">
                <span className="aura-more-name">{r.label}</span>
                <span className="aura-more-desc">{r.tagline}</span>
              </span>
              {r.shortcut && (
                <span className="aura-kbd" aria-hidden>
                  {r.shortcut}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
