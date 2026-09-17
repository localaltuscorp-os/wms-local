"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ChevronDown, Search } from "lucide-react";
import { GlobalSearch } from "@/components/header/global-search";
import { BulkAddQuickAction } from "@/components/header/bulk-add-quick-action";
import { NewTaskQuickAction } from "@/components/header/new-task-quick-action";
import { FocusModeToggle } from "@/components/layout/focus-mode-toggle";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";
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
 * TABS AND "MORE" ARE EXACT COMPLEMENTS. The tabs are the first few rooms and
 * drop out one at a time as the bar narrows; "More" holds precisely the ones
 * that did not get a tab, and nothing else. Both are computed from the same
 * `useTabCount()`, which is why the count is measured in JS rather than faked
 * by hiding tabs in CSS — a hidden tab would leave its room in neither place.
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

/**
 * How many rooms get a tab, by viewport width.
 *
 * This used to be a constant with CSS media queries hiding the overflow, and
 * that combination is now impossible: "More" lists exactly the rooms that did
 * NOT get a tab, so the bar and the menu have to be computed from the SAME
 * number. A CSS rule that hid a tab would drop it out of the bar without
 * putting it in the menu, and that room would be unreachable at that width.
 *
 * ── FOUR, NOT AS MANY AS FIT (account holder, 2026-09-17) ──────────────────
 * The ladder used to climb to eight, so a wide screen filled the strip with
 * every room it could — and the bar read as a crowd rather than a control. It
 * was also the wrong thing to spend the width on: the rooms past the fourth are
 * ones you enter occasionally, while the strip sits on EVERY screen in the app.
 *
 * Four is a deliberate cap, not a measurement — the four rooms with daily
 * traffic (WMS · Goals · Project · Performance), then "More". The point of a
 * fixed number is that the bar keeps the same shape at every desktop width,
 * which is what makes it read as chrome you can ignore instead of a list you
 * re-scan. Nothing is lost: "More" is the exact complement, so every other room
 * is one click away and the room you are IN always keeps its tab (below),
 * however far down the list it sits.
 *
 * The narrow steps stay, and they are measured rather than chosen: below the
 * widths below, the tabs plus the brand plus search genuinely do not fit, and
 * the invariant above says the bar must drop a tab into the menu rather than
 * let CSS hide it.
 */
const TAB_BREAKPOINTS: readonly { min: number; tabs: number }[] = [
  { min: 1120, tabs: 4 },
  { min: 1000, tabs: 3 },
  { min: 860, tabs: 2 },
  { min: 0, tabs: 0 },
];

/** The widest breakpoint, used for the server render and the first paint. */
const TAB_COUNT_SSR = 4;

/**
 * Subscribes to the breakpoints above.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: it takes a dedicated
 * server snapshot, so the markup React renders on the server and the markup it
 * hydrates with agree by construction instead of by luck.
 */
function useTabCount(): number {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const lists = TAB_BREAKPOINTS.filter((b) => b.min > 0).map((b) =>
        window.matchMedia(`(min-width: ${b.min}px)`),
      );
      lists.forEach((m) => m.addEventListener("change", onChange));
      return () => lists.forEach((m) => m.removeEventListener("change", onChange));
    },
    () => {
      const w = window.innerWidth;
      return TAB_BREAKPOINTS.find((b) => w >= b.min)?.tabs ?? 0;
    },
    () => TAB_COUNT_SSR,
  );
}

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

  /* The dashboard has no `DashboardSidebar`, so it has no mobile bar of its own
     and this one must show at every width there. Read off the path rather than
     plumbed down as a prop, because the `(app)` layout is SHARED and does not
     re-run on a soft navigation: a prop decided up there would freeze on the
     first page landed. */
  const onDashboard = pathname === "/hub";

  const tabCount = useTabCount();

  /* The first `tabCount` rooms get tabs — except that the room you are IN always
     does, even when it sits past the cut. A bar whose active tab is invisible
     tells you less than no tabs at all.

     `overflow` is the exact complement: every room that did NOT get a tab, and
     nothing else. That is what "More" holds. Because both come from the same
     `tabCount`, every room is in exactly one of the two at every width. */
  const { tabs, overflow } = React.useMemo(() => {
    let shown = rooms.slice(0, tabCount);
    if (ws && tabCount > 0 && !shown.some((r) => r.id === ws)) {
      const current = rooms.find((r) => r.id === ws);
      if (current) shown = [...shown.slice(0, tabCount - 1), current];
    }
    const ids = new Set(shown.map((r) => r.id));
    return { tabs: shown, overflow: rooms.filter((r) => !ids.has(r.id)) };
  }, [rooms, ws, tabCount]);

  return (
    // Phones already carry a fixed 56px bar from DashboardSidebar, so off the
    // dashboard this one hides rather than eating a third of a small screen.
    <header className={onDashboard ? "aura-topbar app-topbar" : "aura-topbar app-topbar max-md:hidden"}>

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
        <MoreMenu rooms={overflow} current={ws} />
      </nav>

      {/* ONE RIGHT-HAND CLUSTER: search, then the page's own controls, then the
          global ones, then who you are. Search used to grow into the middle of
          the bar, which left the account menu stranded on its own at the end. */}
      <div className="aura-right">
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

        {/* A page's OWN controls (a print button, an edit link) — the same slot
            the previous bar published, so nothing that portals here had to
            change. */}
        <div ref={slots?.setActions} className="flex shrink-0 items-center gap-2 empty:hidden" />

        {/* BULK ADD, restored 2026-09-15. The bar this one replaced carried
            "search · bulk add · create · bell · focus", and bulk add was the
            single control that did not make the crossing — it is still rendered
            in DashboardSidebar, so it survived on phones and vanished on
            desktop, which is why it read as "it works in wms-local but not
            here". Placed before Create, the order the old bar used.

            It gates itself: BulkAddQuickAction renders nothing outside WMS, so
            it is safe to mount unconditionally here. */}
        <BulkAddQuickAction />
        <NewTaskQuickAction />
        <FocusModeToggle />
        {bell}
        {userMenu}
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
 * The "More" menu — the rooms that did NOT get a tab, with their colour, their
 * tagline and the digit that opens them.
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

      <div className="aura-glass aura-more-panel" role="menu" aria-label="More workspaces">
        <div className="aura-more-label">MORE WORKSPACES</div>
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
