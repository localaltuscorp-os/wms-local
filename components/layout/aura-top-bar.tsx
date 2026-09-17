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
 * How many rooms get a tab, MEASURED from the real DOM instead of guessed from
 * the viewport.
 *
 * The old approach was a fixed `min-width` breakpoint ladder (8 tabs ≥1720px,
 * 7 ≥1580px, …). It broke because those numbers assumed the tabs had the whole
 * window to themselves, which they never do: the brand, the portaled page title
 * (the HR console portals a long one) and the right cluster (search + actions +
 * create + focus + bell + the account menu) all eat width that the ladder never
 * counted. At a width the ladder said "8 tabs fit", they ran into the search bar.
 *
 * Now we measure: render every room's tab into an off-screen strip to learn its
 * true pixel width, watch the nav's real width with a ResizeObserver, and show
 * exactly as many tabs — plus the "More" button — as actually fit. Tabs and
 * "More" remain exact complements, so no room is ever unreachable.
 */

/** The count rendered on the server / before the first measurement lands. */
const TAB_COUNT_SSR = 6;

/** The flex gap between tabs (mirrors `.aura-tabs` in aura.css). */
const TAB_GAP = 4;

function useTabCount(rooms: AuraRoom[]): {
  navRef: React.RefObject<HTMLElement | null>;
  tabCount: number;
} {
  const navRef = React.useRef<HTMLElement | null>(null);
  // Each room's tab width, measured once off-screen. `null` until measured.
  const [tabWidths, setTabWidths] = React.useState<number[] | null>(null);
  // The "More" button width, same strip.
  const [moreWidth, setMoreWidth] = React.useState(0);
  // The nav's live width = the space tabs + More may occupy.
  const [available, setAvailable] = React.useState(0);

  /* Measure every room's tab, plus the More button, in a hidden strip that
     carries the real `.aura-tab` / `.aura-tab-dot` classes so the numbers match
     the rendered bar. Runs once when the room list is known. */
  React.useLayoutEffect(() => {
    if (typeof window === "undefined" || rooms.length === 0) return;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;gap:4px;";
    const tabs: HTMLElement[] = rooms.map((r) => {
      const a = document.createElement("a");
      a.className = "aura-tab";
      const dot = document.createElement("span");
      dot.className = "aura-tab-dot";
      a.appendChild(dot);
      a.appendChild(document.createTextNode(r.label));
      host.appendChild(a);
      return a;
    });
    // The More button, same classes as MoreMenu, plus the 13px chevron.
    const more = document.createElement("button");
    more.type = "button";
    more.className = "aura-tab";
    more.appendChild(document.createTextNode("More"));
    const chev = document.createElement("span");
    chev.style.cssText = "display:inline-flex;width:13px;height:13px;flex:none;";
    more.appendChild(chev);
    host.appendChild(more);
    document.body.appendChild(host);
    // Measurement is the one legitimate setState-in-effect: it has to run after
    // the DOM exists, it happens once, and it must land before paint so the bar
    // never flashes the SSR tab count then reshuffles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabWidths(tabs.map((a) => a.getBoundingClientRect().width));
    setMoreWidth(more.getBoundingClientRect().width);
    document.body.removeChild(host);
  }, [rooms]);

  /* Watch the nav's width. `clientWidth` is the space flex actually gave it —
     the header's leftover after brand, title and the right cluster — so tabs
     can never be counted against space that is already taken. */
  React.useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setAvailable(w);
    });
    ro.observe(el);
    setAvailable(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  return {
    navRef,
    tabCount: React.useMemo(() => {
      // Not measured yet — fall back to the SSR count so server and first paint
      // agree, then the measurement above replaces it.
      if (!tabWidths || tabWidths.length !== rooms.length || available <= 0) {
        return TAB_COUNT_SSR;
      }
      // Every room fits without a More button? Show all of them.
      const total = tabWidths.reduce((s, w, i) => s + w + (i > 0 ? TAB_GAP : 0), 0);
      if (total <= available) return rooms.length;
      // Otherwise reserve the More button and fit as many tabs as possible.
      const budget = available - moreWidth - TAB_GAP;
      let used = 0;
      let count = 0;
      for (let i = 0; i < rooms.length; i++) {
        const w = (tabWidths[i] ?? 0) + (count > 0 ? TAB_GAP : 0);
        if (used + w > budget) break;
        used += w;
        count = i + 1;
      }
      // The room you are in is force-shown downstream; keep at least one tab so
      // the bar never collapses to nothing on a very narrow window.
      return Math.max(1, count);
    }, [tabWidths, moreWidth, available, rooms]),
  };
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

  const { navRef, tabCount } = useTabCount(rooms);

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

      <nav ref={navRef} className="aura-tabs" aria-label="Workspaces">
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
