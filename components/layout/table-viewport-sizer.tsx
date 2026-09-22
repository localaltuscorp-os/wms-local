"use client";

import * as React from "react";

/**
 * EVERY TABLE'S SCROLLPORT, SIZED TO THE ROOM ACTUALLY LEFT ON SCREEN.
 *
 * Manan, 2026-09-16: "do same for all app tables — the rows range is different
 * but do same for all tables."
 *
 * There are ~129 tables across the modules, each with its own page-size control
 * (10/20/25/50 in one place, something else in another). Editing all of them
 * means 129 diffs plus every table written after today silently not having it,
 * so the measurement lives here and runs for all of them at once. Mounted once
 * in the root layout; renders nothing.
 *
 * WHAT IT MEASURES, and why a CSS-only rule could not.
 *
 *   app/globals.css caps every table wrapper at `calc(100dvh - 4.5rem)`. That is
 *   a viewport calculation, and the viewport is not where a table STARTS — one
 *   under a filter bar and a KPI strip begins some 300px down the page, so a box
 *   that tall ends 300px BELOW the fold, taking the last rows and the pagination
 *   footer with it. CSS cannot see that offset. This can: it reads each
 *   wrapper's own position and hands it the space between its top edge and the
 *   bottom of the window, less whatever shares its card below it.
 *
 * ── IT MUST NOT TOUCH `style`. THIS IS THE WHOLE DESIGN CONSTRAINT. ─────────
 *
 * The first version called `el.style.setProperty("--table-scroll-max-h", …)`,
 * and that is a hydration bug, not a style choice. These wrappers are React
 * elements, most of them already carrying a `style` prop (the Goals table
 * passes a boxShadow). React hydrates by comparing the DOM it finds against the
 * props it rendered; an inline custom property this file added is an attribute
 * React never rendered, so the comparison fails:
 *
 *     A tree hydrated but some attributes of the server rendered HTML didn't
 *     match the client properties … - --table-scroll-max-h: "503px"
 *
 * React then abandons the mismatched subtree and re-renders it from scratch —
 * which on a table means losing whatever client state it held.
 *
 * So the value is delivered through a STYLESHEET instead. Each wrapper gets a
 * `data-table-scroll` index, and one <style> element in <head>, created and
 * owned by this component, carries
 * `[data-table-scroll="3"] { --table-scroll-max-h: … }` per wrapper. No
 * property React manages is written to at any point.
 *
 * ── BUT AN ATTRIBUTE IS NOT A FREE PASS. IT IS ONLY SAFE ONCE HYDRATED. ─────
 *
 * An earlier note here claimed `data-table-scroll` was "an attribute React does
 * not render and therefore does not diff". That is WRONG, and it cost a second
 * round of the same bug. React's hydration compares the DOM it finds against
 * the props it rendered in BOTH directions: an attribute present in the markup
 * that the component never rendered is an EXTRA, and React reports it exactly
 * like a changed one (see `emitPendingHydrationWarnings`). Writing our
 * attribute onto a node React has not hydrated yet reintroduces the mismatch
 * the stylesheet was supposed to avoid.
 *
 * And the race is the normal case, not a corner: this component is mounted in
 * the ROOT LAYOUT, so its effect runs the moment the LAYOUT hydrates, while the
 * page below it is still streaming inside its Suspense boundary. The first
 * measure pass therefore walks server HTML that React has not reached — on
 * /hub, the Aura table card — and stamps an attribute onto it moments before
 * React hydrates that subtree. React then abandons the mismatched subtree and
 * re-renders it, which is the table state loss this file exists to prevent.
 *
 * So every wrapper is checked with `isHydrated` below before it is written to,
 * and anything still pending simply schedules another pass. Skipping costs
 * nothing: a wrapper with no rule of its own falls back to the CSS cap in
 * globals.css until the retry lands.
 *
 * MEASURED AT REST, ON RESIZE, NEVER ON SCROLL. `scrollY` is added back so the
 * number is the element's resting offset rather than wherever it has been
 * scrolled to; re-measuring on scroll would grow the box as it rose up the
 * viewport and resize the table under the reader's cursor on every wheel tick.
 */

/** Space left below the scrollport when nothing else claims it. */
const GAP = 16;
/** Never squeeze a table below this — a three-row window is worse than a little
 *  overflow, and overflow is survivable now that the scroll chains out to the
 *  page (see the overscroll rules in globals.css). */
const FLOOR = 260;
/** The attribute we key the generated rules off. Ours, not React's. */
const ATTR = "data-table-scroll";
const STYLE_ID = "table-viewport-sizes";
/**
 * Ignore a change smaller than this.
 *
 * THE FEEDBACK LOOP THIS BREAKS. Writing a max-height changes a table's height,
 * which changes `document.body`'s height, which is what the ResizeObserver
 * below is watching — so every write schedules another measure. That converges
 * only while the measurement is exactly stable; a sub-pixel difference in a
 * rounded offset is enough to make it oscillate instead, and an oscillating
 * rAF loop pegs a core and leaves the page apparently stuck loading.
 *
 * Hysteresis makes convergence the guaranteed outcome rather than the lucky
 * one: a recomputed height within 8px of the one already applied is treated as
 * "no change", nothing is written, and the loop stops on the next pass. 8px is
 * far below a table row, so nothing visible is being given up.
 */
const EPSILON = 8;
/** How many extra passes to spend waiting for a subtree to finish hydrating.
 *  At the 150ms debounce below that is ~6s — long enough for a slow streamed
 *  page, bounded so a wrapper that never hydrates cannot spin forever. */
const MAX_HYDRATION_RETRIES = 40;

/**
 * Has React hydrated this node yet?
 *
 * React tags every host instance with an own `__reactFiber$<key>` property as
 * it hydrates or mounts it; server HTML that React has not reached carries no
 * such property. That is the only reliable way to ask "is it safe to write to
 * this node", and it is why the check is worth the reach into an internal
 * naming convention — stable since React 16, and a wrong answer here is only a
 * deferred measurement, never a broken render.
 */
function isHydrated(el: Element): boolean {
  for (const key of Object.keys(el)) {
    if (key.startsWith("__reactFiber$")) return true;
  }
  return false;
}

export function TableViewportSizer() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    // What each wrapper was last given, so a re-measure can tell a real change
    // from the echo of its own previous write.
    const applied = new Map<Element, number>();

    // Our own <style>, appended to <head>. Not rendered by React, so nothing
    // here participates in hydration.
    let sheet = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = STYLE_ID;
      document.head.appendChild(sheet);
    }

    function measure() {
      frame = 0;
      const tables = document.querySelectorAll("table");
      // The common case on most routes: no table, nothing to size. Bail before
      // touching layout so a mutation-heavy page with no table costs nothing.
      if (tables.length === 0) {
        if (sheet && sheet.textContent !== "") sheet.textContent = "";
        return;
      }

      const rules: string[] = [];
      let index = 0;
      // Set when a wrapper was skipped because React had not hydrated it yet,
      // so the pass can ask to be run again rather than writing into markup
      // that is about to be hydrated.
      let pending = false;

      for (const table of tables) {
        const el = table.parentElement;
        if (!el) continue;

        // NOT HYDRATED YET — leave it completely alone. See the header note.
        if (!isHydrated(el)) {
          pending = true;
          continue;
        }

        // Only a real scrollport. A <table> sitting directly in a card with no
        // overflow of its own has nothing to cap — the page scrolls it, and the
        // header sticks to the viewport, which already works.
        const cs = getComputedStyle(el);
        if (cs.overflowY === "visible" && cs.overflowX === "visible") continue;

        // A table inside a dialog or a popover is positioned against the
        // viewport, not the document, so a document-offset measurement is
        // meaningless there. Those size themselves against their own container.
        if (el.closest("[role='dialog'], [data-radix-popper-content-wrapper]")) continue;

        const restingTop = el.getBoundingClientRect().top + window.scrollY;
        // Sits entirely below the first screenful — leave it to the CSS
        // fallback rather than pinning it to the floor.
        if (restingTop >= window.innerHeight) {
          el.removeAttribute(ATTR);
          continue;
        }

        // Whatever shares the card below the scrollport — the pagination
        // footer, a totals strip — has to fit on screen too.
        let below = 0;
        for (let sib = el.nextElementSibling; sib; sib = sib.nextElementSibling) {
          below += (sib as HTMLElement).offsetHeight || 0;
        }

        const available = window.innerHeight - restingTop - below - GAP;
        const raw = Math.max(FLOOR, Math.round(available));
        // Hold the previous value unless the new one differs materially — see
        // EPSILON. This is what terminates the observer feedback loop.
        const prev = applied.get(el);
        const px = prev !== undefined && Math.abs(prev - raw) < EPSILON ? prev : raw;
        applied.set(el, px);

        const key = String(index++);
        // Only write when it actually changes: every attribute write is a DOM
        // mutation, and the observer below is watching.
        if (el.getAttribute(ATTR) !== key) el.setAttribute(ATTR, key);
        rules.push(`[${ATTR}="${key}"]{--table-scroll-max-h:${px}px}`);
      }

      const next = rules.join("");
      if (sheet && sheet.textContent !== next) sheet.textContent = next;

      // Something was still hydrating. Come back for it — the observers below
      // cannot be relied on here, because hydration adopts existing nodes and
      // may not mutate childList at all.
      if (pending && retries < MAX_HYDRATION_RETRIES) {
        retries++;
        scheduleRaw();
      }
    }

    // DEBOUNCED, not per-frame.
    //
    // The MutationObserver below watches the whole body subtree, and plenty of
    // things mutate it continuously without changing a single table: the route
    // progress bar, toasts, spinners, any animation that adds and removes a
    // node. A bare rAF schedule turns each of those into a full measure pass —
    // querySelectorAll("table"), then getComputedStyle and
    // getBoundingClientRect per table, each one forcing synchronous layout —
    // every frame, for as long as the animation runs. That is enough to hold
    // the main thread and leave a page apparently stuck on its loading state.
    //
    // 150ms of quiet first, then one rAF. A burst of mutations collapses to a
    // single pass, and a continuous animation costs at most ~7 passes a second
    // instead of 60.
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Budget for the hydration retries above, spent down by the measure pass
    // and refilled by any real trigger.
    let retries = 0;
    function scheduleRaw() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (frame) return;
        frame = requestAnimationFrame(measure);
      }, 150);
    }
    /** A genuine trigger — resize, mutation, route change. Refills the retry
     *  budget, because fresh content deserves a fresh wait for hydration. */
    function schedule() {
      retries = 0;
      scheduleRaw();
    }

    schedule();

    // The bars ABOVE a table are what move its top edge, and a filter chip
    // wrapping onto a second line changes that without changing the window
    // size — so watch the document, not just the window.
    //
    // This is also the feedback path: our own writes change body height and
    // land back here. EPSILON above is what stops that becoming a loop; the
    // observer is deliberately left in place rather than removed, because
    // without it a wrapped filter row silently leaves every table mis-sized.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    // Rows per page, a route change, a filter applied: all of them swap the
    // table out. `childList` only — an attributes observer would see our own
    // ATTR writes and loop.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (timer) clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return null;
}
