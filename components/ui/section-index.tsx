"use client";

import * as React from "react";

export interface SectionIndexItem {
  /** DOM id of the section this row scrolls to. */
  id: string;
  label: string;
}

/**
 * A numbered, sticky SECTION INDEX that always marks the section you can see.
 *
 * ── WHY IT READS THE SCROLL POSITION, NOT AN IntersectionObserver ─────────
 * The first version watched sections with an IntersectionObserver against the
 * viewport. That drifted out of step with the page for two reasons:
 *
 *   1. These screens do not scroll the WINDOW. They scroll a container inside
 *      the app shell, so "the viewport" and "what you can see" were measured
 *      against different boxes, and a fixed rootMargin could not reconcile them.
 *   2. The last sections are short. Near the bottom they can never reach the top
 *      detection band, so the index stayed on an earlier section while the final
 *      one was plainly on screen.
 *
 * So this finds the element that actually scrolls, and on every scroll asks one
 * question: which section's top has passed the line just below the sticky
 * header? That is the section being read. At the very bottom of the page the
 * last section wins outright, because it has nowhere further to scroll.
 *
 * `offset` is the height of whatever sticks above the content (a candidate bar,
 * say), so the answer matches what is visible under it rather than behind it.
 */
export function SectionIndex({
  items,
  offset = 16,
  stickyTop = 16,
  disabled = false,
  title = "Sections",
}: {
  items: SectionIndexItem[];
  /** Pixels covered by sticky chrome above the content. */
  offset?: number;
  /** Where the index itself sticks, from the top of the scroll container. */
  stickyTop?: number;
  /** Nothing to navigate yet (e.g. no record loaded). */
  disabled?: boolean;
  title?: string;
}) {
  const [active, setActive] = React.useState(items[0]?.id ?? "");
  // While a click-initiated smooth scroll is running, scroll events describe
  // the journey, not the destination. Holding the choice avoids the marker
  // flickering through every section in between.
  const locked = React.useRef(false);
  const unlockTimer = React.useRef<number | undefined>(undefined);
  const ids = items.map((i) => i.id).join("|");

  const findScroller = React.useCallback((): HTMLElement | Window => {
    const first = items.length ? document.getElementById(items[0]!.id) : null;
    let el = first?.parentElement ?? null;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return window;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  React.useEffect(() => {
    if (disabled || items.length === 0) return;
    let raf = 0;
    let scroller: HTMLElement | Window = window;

    const measure = () => {
      raf = 0;
      if (locked.current) return;
      const isWin = scroller === window;
      const box = isWin ? null : (scroller as HTMLElement);
      const viewTop = box ? box.getBoundingClientRect().top : 0;
      const scrollTop = box ? box.scrollTop : window.scrollY;
      const viewH = box ? box.clientHeight : window.innerHeight;
      const fullH = box ? box.scrollHeight : document.documentElement.scrollHeight;

      if (scrollTop + viewH >= fullH - 4) {
        setActive(items[items.length - 1]!.id);
        return;
      }
      let current = items[0]!.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - viewTop <= offset + 12) current = item.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    // Sections can mount a frame after this effect (a record loading in), so
    // resolve the scroller on the next frame rather than immediately.
    const start = requestAnimationFrame(() => {
      scroller = findScroller();
      scroller.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      onScroll();
    });

    return () => {
      cancelAnimationFrame(start);
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, disabled, offset, findScroller]);

  function jump(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const scroller = findScroller();
    const isWin = scroller === window;
    const box = isWin ? null : (scroller as HTMLElement);
    const viewTop = box ? box.getBoundingClientRect().top : 0;
    const current = box ? box.scrollTop : window.scrollY;
    const top = current + el.getBoundingClientRect().top - viewTop - offset;
    // Hold the chosen row for the length of the smooth scroll, then hand
    // control back to the scroll position. A timer rather than a timestamp:
    // this runs in an event handler, and reading the clock here trips React's
    // purity rule for anything declared in the component body.
    locked.current = true;
    window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => {
      locked.current = false;
    }, 700);
    setActive(id);
    (box ?? window).scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  return (
    <div
      className="rounded-2xl border border-hairline bg-white p-3 lg:sticky"
      style={{ top: stickyTop }}
    >
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">{title}</p>
      <nav className="flex flex-col gap-0.5">
        {items.map((item, i) => {
          const on = !disabled && active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => jump(item.id)}
              disabled={disabled}
              aria-current={on ? "true" : undefined}
              className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-soft disabled:opacity-45 disabled:hover:bg-transparent"
              style={on ? { background: "color-mix(in srgb, var(--color-altus-red) 8%, white)" } : undefined}
            >
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11.5px] font-black"
                style={
                  on
                    ? { background: "linear-gradient(135deg,#E10600,#A80400)", color: "#fff" }
                    : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }
                }
              >
                {i + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                style={{ color: on ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
