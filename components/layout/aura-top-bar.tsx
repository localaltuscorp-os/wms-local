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
import { tabsAndMore, type AuraRoom } from "@/lib/aura-rooms";

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
 *   [rail toggle] [Altus] [WMS · Goals · Project · More ▾] [—— search ——] [+ ◑ 🔔 ●]
 *
 * THREE TABS, THE REST UNDER "MORE" (account holder, 2026-09-19: "3 options —
 * WMS, Goals, Project — and a More dropdown, which will look clean; do this
 * all over"). Those three have a tab on every screen; every other room is in
 * More — the room you are in included, which then lights More up rather than
 * pushing in a tab of its own (lib/aura-rooms.ts, TAB_ROOMS).
 *
 * TABS AND "MORE" ARE EXACT COMPLEMENTS. On a window too narrow even for the
 * three, the last ones move to the front of More, one at a time; "More" holds
 * precisely the rooms without a tab, and nothing else. Both come from the same
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
 * How many of the tab rooms get their tab, MEASURED from the real DOM instead
 * of guessed from the viewport.
 *
 * The old approach was a fixed `min-width` breakpoint ladder (8 tabs ≥1720px,
 * 7 ≥1580px, …). It broke because those numbers assumed the tabs had the whole
 * window to themselves, which they never do: the brand, the portaled page title
 * (the HR console portals a long one) and the right cluster (search + actions +
 * create + focus + bell + the account menu) all eat width that the ladder never
 * counted. At a width the ladder said "8 tabs fit", they ran into the search bar.
 *
 * Now we measure: render each tab room's tab into an off-screen strip to learn
 * its true pixel width, watch the nav's real width with a ResizeObserver, and
 * show as many of them — plus the "More" button — as actually fit, up to all
 * three. Before the first measurement (and on the server) all of them show.
 */

/** The flex gap between tabs (mirrors `.aura-tabs` in aura.css). */
const TAB_GAP = 4;

function useTabCount(
  rooms: AuraRoom[],
  /** Whether More has rooms of its own, so its button is there whatever fits. */
  hasMore: boolean,
): {
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
  // Flipped when the web font finishes loading. The first measurement runs
  // against the FALLBACK font; Inter is wider, so a count computed from fallback
  // widths overflows the bar the instant the real font swaps in. Re-measuring on
  // fonts.ready is what stops the tabs overlapping each other.
  const [fontsReady, setFontsReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Measure every room's tab, plus the More button, in a hidden strip that
     carries the real `.aura-tab` / `.aura-tab-dot` classes so the numbers match
     the rendered bar. Runs when the room list is known AND again when the web
     font lands (see fontsReady above). */
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
  }, [rooms, fontsReady]);

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
      // Not measured yet — every tab, as the server rendered them, so server and
      // first paint agree; the measurement above then replaces it.
      if (!tabWidths || tabWidths.length !== rooms.length || available <= 0) {
        return rooms.length;
      }
      // No More button needed and every tab fits? Show all of them.
      const total = tabWidths.reduce((s, w, i) => s + w + (i > 0 ? TAB_GAP : 0), 0);
      if (!hasMore && total <= available) return rooms.length;
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
      // None fits on a very narrow window: More alone, which then holds them all.
      return count;
    }, [tabWidths, moreWidth, available, rooms, hasMore]),
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

  /* The tab rooms — WMS, Goals, Project, those this person may enter — and the
     rest, which are always under More. */
  const all = React.useMemo(() => tabsAndMore(rooms), [rooms]);
  const { navRef, tabCount } = useTabCount(all.tabs, all.more.length > 0);

  /* As many tab rooms as fit get their tab; `overflow` is the exact complement,
     every room without a tab and nothing else — what "More" holds. The room
     you are in gets no tab of its own: when it is under More, More lights up. */
  const { tabs, more: overflow } = React.useMemo(() => tabsAndMore(rooms, tabCount), [rooms, tabCount]);
  const inMore = overflow.find((r) => r.id === ws) ?? null;

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
        <MoreMenu rooms={overflow} current={ws} active={inMore} />
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
 * tagline and the key that opens them. `active` is the room you are in when it
 * is one of them: the button then shows as the current tab, and says which.
 *
 * Open on hover, on click, and whenever anything inside has keyboard focus.
 * The close is delayed ~120ms so the diagonal mouse path from the button to the
 * first item does not dismiss the thing you are reaching for.
 */
function MoreMenu({
  rooms,
  current,
  active,
}: {
  rooms: AuraRoom[];
  current: WorkspaceId | null | undefined;
  active: AuraRoom | null;
}) {
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
        data-active={active ? "true" : undefined}
        aria-label={active ? `More — you are in ${active.label}` : undefined}
        title={active ? `You are in ${active.label}` : undefined}
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
