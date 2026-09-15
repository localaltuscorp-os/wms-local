"use client";

import * as React from "react";

/**
 * THE TRAVELLING INDICATOR — one glass lens that follows the pointer down a
 * rail and comes to rest on the selected row.
 *
 * There are no per-row backgrounds anywhere this is used; this element IS the
 * selection. It renders as the first child of its scroll container and drives
 * three custom properties (`--lens-y`, `--lens-h`, `--lens-o`) that
 * `.aura-grail-lens` in app/aura.css turns into position, height and presence.
 *
 * Two traps the design spec warns about, both kept:
 *
 * DO NOT TRANSITION THE FIRST PLACEMENT. The lens ships with `transition: none`
 * and only gains the animated one via `.is-ready`, 60ms after the first
 * successful measurement. Without that it can stay pinned at `height: 0` in
 * frames where the transition timeline is not ticking.
 *
 * MEASURE ON A TIMER, NOT `requestAnimationFrame`. rAF is paused in background
 * and hidden frames, so a tab restored from the background would never place
 * the lens at all. The initial measurement retries on `setTimeout` (40 × 50ms)
 * and is re-run on `load`, on `document.fonts.ready` and by a `ResizeObserver`
 * — a web font landing changes every row's height.
 *
 * `offsetTop` is measured against the nearest POSITIONED ancestor, so the
 * container must be `position: relative` (aura.css does this for both rails).
 */
export function AuraRailLens({
  itemSelector = ".aura-grail-nav",
  activeSelector = ".aura-grail-nav.is-active",
}: {
  /** Rows the lens can travel to. */
  itemSelector?: string;
  /** The row it rests on when the pointer leaves. */
  activeSelector?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const lens = ref.current;
    const inner = lens?.parentElement;
    if (!lens || !inner) return;

    const place = (el: HTMLElement | null) => {
      if (!el || !el.offsetHeight) {
        lens.style.setProperty("--lens-o", "0");
        return false;
      }
      lens.style.setProperty("--lens-o", "1");
      lens.style.setProperty("--lens-h", `${el.offsetHeight}px`);
      lens.style.setProperty("--lens-y", `${el.offsetTop}px`);
      if (!lens.classList.contains("is-ready")) {
        window.setTimeout(() => lens.classList.add("is-ready"), 60);
      }
      return true;
    };

    const rest = () => place(inner.querySelector<HTMLElement>(activeSelector));

    // Retry on a timer until the rail has real geometry. A rail with no active
    // row (the dashboard's launcher list) simply never places — the lens stays
    // invisible until the pointer summons it, which is the honest state.
    let tries = 0;
    let timer = 0;
    const tick = () => {
      if (rest()) return;
      if (++tries < 40) timer = window.setTimeout(tick, 50);
    };
    tick();

    const onOver = (e: Event) => {
      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>(itemSelector);
      if (row) place(row);
    };
    const onScroll = () =>
      place(inner.querySelector<HTMLElement>(`${itemSelector}:hover`) ?? inner.querySelector<HTMLElement>(activeSelector));

    inner.addEventListener("mouseover", onOver);
    inner.addEventListener("mouseleave", rest);
    inner.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", rest);
    window.addEventListener("load", tick);
    document.fonts?.ready.then(rest).catch(() => {});

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            if (entries.some((en) => en.contentRect.height > 0)) rest();
          })
        : null;
    ro?.observe(inner);

    /* THE ROWS MAY NOT EXIST YET. On the module rail the nav is an async server
       component behind a Suspense boundary, so at mount this container holds a
       `<template>` placeholder and nothing else — and on a slow read the real
       rows can land long after the 2s retry window above has closed. Watching
       for them is the only placement that cannot be outrun. */
    const mo =
      typeof MutationObserver !== "undefined" ? new MutationObserver(() => rest()) : null;
    mo?.observe(inner, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      inner.removeEventListener("mouseover", onOver);
      inner.removeEventListener("mouseleave", rest);
      inner.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", rest);
      window.removeEventListener("load", tick);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [itemSelector, activeSelector]);

  return <div ref={ref} className="aura-grail-lens" aria-hidden />;
}
