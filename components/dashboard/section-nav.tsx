"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/page-shell";

/**
 * SECTION NAV — a single row of pills that scrolls the page to each dashboard
 * section, and highlights whichever one you are looking at.
 *
 * It replaces the Overview | Performance switcher. That control SWAPPED panels,
 * so half the dashboard was always hidden behind a tab; this one navigates a
 * single continuous page, which is why every section is now mounted at once.
 *
 * The ids are declared here rather than passed in: the bar and the sections it
 * points at have to agree, and a typo in one of them is a dead pill. Anything
 * whose id is not on the page is dropped from the bar at mount, so a section
 * that is admin-only or filtered away never leaves a tab pointing at nothing.
 *
 * ORDER IS THE PAGE'S ORDER. These eight run top to bottom exactly as
 * app/(app)/dashboard/page.tsx renders them — a bar whose sequence disagrees
 * with the scroll it drives reads as broken even when every link works.
 */
export const DASHBOARD_SECTIONS = [
  { id: "overdue-by-person", label: "Overdue by Person" },
  { id: "sent-back-work", label: "Sent-Back Work" },
  { id: "aging-heatmap", label: "Aging Heatmap" },
  { id: "delivery-vs-due-date", label: "Delivery vs Due Date" },
  { id: "status-by-doer", label: "Status by Doer" },
  { id: "delegation-scorecard", label: "Delegation Scorecard" },
  { id: "creator-workload", label: "Who Creates Work" },
  { id: "top-performers", label: "Top Performers" },
  { id: "people-to-pull-up", label: "People To Pull Up" },
  { id: "delivered-on-time", label: "Delivered on Time" },
] as const;

/**
 * Fallbacks, used only until the bar has measured itself (and if it never can).
 *
 * WHY THESE ARE NOT THE REAL NUMBERS. The obvious implementation is a fixed
 * `top-[64px]` with a matching `-120` scroll offset, and it breaks here: the
 * chrome this bar has to clear is the FilterBar, whose own row is documented to
 * WRAP TO A SECOND LINE when the filters do not fit. Its height is therefore a
 * function of the viewport and of how many filters are active — never one
 * constant. Guess low and this bar parks behind the filter bar, which owns the
 * higher stacking context (z-40 against this one's z-30), so it simply
 * disappears while you scroll. Guess high and it floats in a band of nothing.
 *
 * So the bar measures the filter bar and pins directly beneath it, and the
 * scroll offset is derived from that same measurement rather than stated twice.
 * One consequence worth having: this is correct on mobile too, where the app's
 * top bar is 56px and on desktop it is 0.
 */
const FALLBACK_STICKY_TOP = 64;
/** Breathing room between the pinned bar's bottom edge and the section title
 *  that lands under it. */
const SCROLL_GAP = 16;

/** How long to trust the click over the observer when no `scrollend` arrives.
 *  Safari has no scrollend event; without a fallback the bar would stay pinned
 *  to the clicked pill forever after the first click in that browser. */
const SCROLL_SETTLE_MS = 1000;

/** One pill: the id of the section it scrolls to, and what it is called. */
export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * `sections` is a PROP with the WMS list as its default.
 *
 * The bar was hardcoded to DASHBOARD_SECTIONS, which was right while the
 * dashboard was the only page with sections to navigate. The Goals Dashboard
 * now has its own, and the choice was to duplicate this file or to pass the
 * list in. Everything below the list — measuring the sticky band, the
 * started/upcoming winner rule, the page-bottom fallback, suppressing the
 * observer during a click-driven scroll — is generic and hard-won, and a copy
 * of it would drift the moment either page was tuned.
 *
 * The default keeps every existing caller (`<DashboardSectionNav />`)
 * behaving exactly as before.
 */
export function DashboardSectionNav({
  sections = DASHBOARD_SECTIONS,
}: {
  sections?: readonly SectionNavItem[];
} = {}) {
  const [present, setPresent] = React.useState<readonly string[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  // Where this bar pins: the app top bar plus whatever the filter bar above it
  // currently measures. Re-read whenever that height changes (filters wrapping
  // to a second row, a resize, a zoom step).
  const [bandHeight, setBandHeight] = React.useState(FALLBACK_STICKY_TOP);
  const navRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const band = document.querySelector<HTMLElement>("[data-dashboard-stickybar]");
    if (!band) return;

    const measure = () => {
      // `--app-topbar-h` is 0 on desktop and 56px under `md`, which is exactly
      // where the filter bar itself pins (`.sticky-below-topbar`). Adding its
      // height gives the y this bar must sit at to land flush underneath.
      const topbar =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-h"),
        ) || 0;
      setBandHeight(topbar + band.offsetHeight);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(band);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Set while a click-driven smooth scroll is in flight. A smooth scroll
  // crosses every section between here and the target, and the observer
  // faithfully reports each one — so without this the bar strobes through four
  // pills on the way down and only then settles. The click's answer is the
  // right one; the observer resumes once the page stops moving.
  const scrollingTo = React.useRef<string | null>(null);

  // Which sections actually rendered. Read once on mount rather than assumed,
  // so a tab can never point at an element that is not there.
  React.useEffect(() => {
    setPresent(
      sections.map((s) => s.id).filter((id) => document.getElementById(id)),
    );
  }, [sections]);

  // What is pinned above the content, in px: this bar's sticky offset plus its
  // own height. Drives BOTH the observer's detection band and the click-scroll
  // landing, so the pill that lights up is the section a click would take you
  // to. Falls back to the bar's own height alone before the measurement lands.
  // The band already CONTAINS this row, so its height IS the whole inset.
  // Adding this bar's own height on top — as was needed when the two were
  // separate sticky elements — would now double-count it and land every
  // section a bar's height too far down the page.
  const detectionInset = bandHeight;

  React.useEffect(() => {
    if (present.length === 0) return;

    // `rootMargin` pulls the detection band up to just under the sticky bar and
    // down to the middle of the viewport, so the highlighted pill is the
    // section you are READING — not whichever one happens to touch the bottom
    // edge, which is what a bare 0-margin observer would report.
    //
    // THRESHOLD IS [0, 0.3], NOT A BARE 0.3. `threshold` measures how much of
    // the TARGET is showing, so a section taller than ~3× the detection band
    // can never reach 30% of itself and a bare 0.3 would leave its pill dead —
    // Status by Doer and the Aging Heatmap both get that tall on a full team.
    // Keeping 0 in the list means every section still reports, and 0.3 gives
    // the extra callback as a section takes over the viewport.
    /* EVERY SECTION'S STATE, NOT JUST THE ONES THAT CHANGED.

       This is the flicker. An IntersectionObserver callback receives ONLY the
       targets whose intersection changed, never the full set — so picking the
       topmost out of `entries` picks the topmost of an arbitrary subset. Two
       ways that goes wrong, both of which look like the bar strobing:

         · Scrolling from Aging Heatmap into Status by Doer fires a callback
           carrying only the heatmap (now leaving). Status by Doer is already
           intersecting but is not IN this callback, so the filtered list is
           empty and the bar keeps pointing at the section you just left.
         · A section further down crosses the band on its own. It arrives as the
           only entry, is trivially "topmost of one", and steals the highlight
           from the section actually under the bar.

       So the callback maintains the state of all observed sections and re-reads
       the winner from that map each time. `entries` updates the map; the map
       decides the pill. Positions are read live rather than from
       `boundingClientRect` on the entry, because a stored rect is a snapshot
       from when the callback was queued and the page has moved since. */
    const intersecting = new Map<string, boolean>();

    /* THE SECTION THAT OWNS THE TOP OF THE BAND — not the one with the
       smallest `top`.

       "Topmost" used to mean `min(rect.top)`, and that is precisely why the
       pill stuck on Status by Doer while you scrolled on through Delegation
       Scorecard. A tall section whose heading has scrolled far above the
       viewport has a top of, say, -3200px, and it goes on intersecting the
       band until its FOOT clears the line. Every section starting below it has
       a LARGER top, so `min` kept re-electing the section you had already
       scrolled past — and kept it for as long as that section was tall, which
       is exactly what Status by Doer and the Aging Heatmap become on a full
       team. The bug scaled with the data, which is why it looked intermittent.

       The band's top edge is the line under the pinned chrome. A section has
       STARTED once its own top is at or above that line, and the one that
       started MOST RECENTLY — the largest top among those — is the one sitting
       directly under the bar, which is the one being read. Before anything has
       started (the very top of the page) fall back to the nearest section still
       below the line, so the first pill lights instead of none. */
    const pickActive = () => {
      const line = detectionInset;
      let startedId: string | null = null;
      let startedTop = -Infinity;
      let upcomingId: string | null = null;
      let upcomingTop = Infinity;

      for (const [id, isVisible] of intersecting) {
        if (!isVisible) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        // Read live. A rect stored on the entry is a snapshot from when the
        // callback was queued, and the page has moved since.
        const top = el.getBoundingClientRect().top;
        // +1 absorbs sub-pixel rounding, so a section resting exactly on the
        // line counts as started rather than flickering across the boundary.
        if (top <= line + 1) {
          if (top > startedTop) {
            startedTop = top;
            startedId = id;
          }
        } else if (top < upcomingTop) {
          upcomingTop = top;
          upcomingId = id;
        }
      }

      // ONE id. `active` is a single string rather than a set, so exactly one
      // pill can hold the highlight — there is no state in which two are lit.
      const next = startedId ?? upcomingId;
      if (next) setActive(next);
    };

    /* THE LAST SECTION CAN NEVER REACH THE LINE, so it needs a floor.

       Delivered on Time is the final block on the page: there is nothing under
       it to scroll, so at the very bottom its top still sits well below the
       detection line and it never counts as STARTED. People To Pull Up, which
       did cross, stays the winner — and the pill stays wrong for the whole last
       screenful no matter how the band is tuned. This is structural, not a
       margin that needs another 5%.

       At the true bottom of the document the answer is not in doubt: the last
       section present IS the one being read. `-2` absorbs the sub-pixel
       rounding that browsers introduce at fractional zoom, where
       innerHeight + scrollY lands a hair under scrollHeight and a strict
       comparison never fires. */
    const atPageBottom = () =>
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

    const sync = () => {
      // A click owns the highlight until its scroll settles.
      if (scrollingTo.current) return;
      if (atPageBottom()) {
        const last = present[present.length - 1];
        if (last) {
          setActive(last);
          return;
        }
      }
      pickActive();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        // The map is updated FIRST, even mid-click, so the observer resumes
        // with an accurate picture instead of whatever it last saw before it.
        for (const e of entries) intersecting.set(e.target.id, e.isIntersecting);
        sync();
      },
      // The top inset MUST track the pinned chrome. It was a hardcoded -72px,
      // set when this bar was the only thing pinned; now the filter bar is
      // above it too, so a section can be fully hidden behind ~140px of chrome
      // while the observer still calls it visible — and lights the wrong pill.
      // Same measurement the scroll offset uses, so the band and the landing
      // position can never disagree.
      { rootMargin: `-${detectionInset}px 0px -65% 0px`, threshold: [0, 0.3] },
    );

    for (const id of present) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    /* An IntersectionObserver fires only when an intersection CHANGES, and
       arriving at the bottom of the page changes none — the last section was
       already visible on the way down. So the bottom-of-page case needs a
       scroll listener; there is no observer configuration that reports it.

       rAF-throttled and passive: at most one recompute per painted frame, and
       the listener never blocks the scroll it is watching. `sync` is a handful
       of getBoundingClientRect reads over the sections currently on screen,
       which is cheap at that rate. */
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sync();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Settle the pill against the position the page is ALREADY at — a reload
    // part-way down the page fires no scroll event.
    sync();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [present, detectionInset]);

  const go = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    // Set the pill immediately. The observer will confirm it a moment later,
    // but waiting for the scroll to settle makes the click feel unacknowledged.
    setActive(id);
    scrollingTo.current = id;

    // Derived, never restated. The clearance a section needs is exactly what
    // is pinned above it: this bar's own sticky offset plus its own height.
    // Writing that as a second constant is how the two drift the moment the
    // filter bar gains a row.
    const offset = detectionInset + SCROLL_GAP;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: "smooth" });

    // Hand the highlight back to the observer once the page stops. `scrollend`
    // where it exists, a timer everywhere else — whichever lands first wins,
    // and the other is torn down with it.
    const release = () => {
      // Only release OUR lock. Clicking a second pill mid-scroll starts a new
      // lock, and this release — still queued from the first click — would
      // otherwise clear it and hand the highlight back to the observer while
      // the second scroll is still travelling.
      if (scrollingTo.current === id) scrollingTo.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", release);
    };
    const timer = window.setTimeout(release, SCROLL_SETTLE_MS);
    window.addEventListener("scrollend", release, { once: true });
  }, [detectionInset]);

  if (present.length === 0) return null;

  const tabs = sections.filter((s) => present.includes(s.id));

  return (
    // A FULL-BLEED FROSTED BAND, pinned under the filter bar.
    //
    // This was a rounded standalone card a moment ago, and the change is
    // deliberate: the bar has moved ABOVE the Task Summary, so it now reads as
    // the second row of the page's chrome rather than as a widget between two
    // sections. Chrome is full-bleed here — the filter bar directly above it is
    // exactly this shape, frosted background and hairline included — and a
    // rounded card floating in the chrome band would be the odd one out.
    //
    // Translucent + `backdrop-blur-md` for the same reason. As a card in the
    // content flow it had to be opaque or the rows underneath ghosted through
    // it; as a band matching the filter bar, the frosting IS the house style.
    //
    // `top` is inline, not a `top-[64px]` class: it is measured (see the effect
    // above), because the filter bar it clears has no fixed height.
    <nav
      ref={navRef}
      aria-label="Dashboard sections"
      /* NOT `sticky`, and no `top`. This is the second ROW of the sticky band
         in app/(app)/dashboard/page.tsx, which pins both rows together — a
         nested sticky here would be a second positioned context solving a
         problem the parent already solves, and it is exactly what let the two
         rows drift apart. The band draws the background, the blur and the one
         bottom edge; this row only spaces its pills. */
      className="w-full py-1.5"
    >
      {/* Inner shell so the pills line up with the section titles they point
          at. The band bleeds edge to edge; its CONTENT sits on the same gutter
          as everything else, which is how the filter bar above does it too
          (`mx-auto max-w-[1600px] px-6`).
          
          `overflow-x-auto` + `whitespace-nowrap` let a narrow viewport scroll
          the pills sideways instead of wrapping them onto a second line —
          which, on a bar whose whole job is to be a predictable fixed height,
          would move every section under it on resize. */}
      <PageShell as="div" width="full" py={false}>
        <div className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
        {tabs.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-current={isActive ? "true" : undefined}
              // NO `dark:` VARIANTS. This app has no dark theme — the dashboard
              // paints an opaque white canvas and every surface under it is
              // hardcoded light. Tailwind's default `dark:` follows the OS
              // setting, so `dark:bg-slate-800` here would darken these pills
              // for anyone whose laptop is in dark mode while the bar they sit
              // on stayed white. Same call as manager-activity-table.tsx and
              // section-chrome.tsx, for the same reason.
              // h-7 with fixed padding instead of `py-1.5`: a height that is
              // stated rather than derived keeps all eight pills identical, and
              // keeps the bar's own height stable when a label wraps its font
              // metrics differently. rounded-lg, not -full — at 28px tall a
              // full radius reads as a lozenge rather than a tab.
              className={`inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-xs ${
                isActive
                  ? "font-semibold text-white shadow-sm transition-all duration-200"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              // THE BRAND RED, not Tailwind's `red-600` (#DC2626). This app's
              // primary red is #E10600 and it already has a token — the CTA
              // buttons, the accent rail and every `text-altus-red` hover read
              // from it. A second near-identical red hardcoded here is the
              // drift that ends with nobody knowing which one is correct.
              style={isActive ? { background: "var(--color-altus-red)" } : undefined}
            >
              {s.label}
            </button>
          );
        })}
        </div>
      </PageShell>
    </nav>
  );
}
