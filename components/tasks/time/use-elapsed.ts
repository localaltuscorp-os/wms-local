"use client";

import * as React from "react";

/**
 * ONE ticker for every clock on the page.
 *
 * The task detail can show four or five live readouts at once — the hero
 * band's total, the Time Spent card, and a row in the session table for each
 * open session — and an interval per component means N timers waking the tab N
 * times a second to render the same instant. Subscribers share this one.
 */
let nowMs = 0;
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (ticker === null) {
    nowMs = Date.now();
    ticker = setInterval(() => {
      nowMs = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

const getSnapshot = () => nowMs;

/**
 * ZERO ON THE SERVER, and that is not a nicety.
 *
 * A live task timer is server-rendered: `/tasks?task=<id>` and `/tasks/<id>`
 * both paint the hero band's clock on the server. Reading the wall clock there
 * gives the SERVER's instant, and by the time that HTML reaches the browser
 * several seconds have passed — so React compared `00:02:58` against `00:03:01`,
 * called it a hydration mismatch, threw, and discarded the whole task-detail
 * subtree to re-render it on the client. Every open of a task with a running
 * timer did that.
 *
 * `useSyncExternalStore` takes this as its SERVER SNAPSHOT, which React also
 * uses for the client's hydration pass — so both agree on "no elapsed time yet"
 * and show the banked total, and the real value arrives on the first tick after
 * hydration. One frame nobody sees, in exchange for a subtree that hydrates.
 */
const getServerSnapshot = () => 0;

/**
 * Ticking elapsed-seconds since `startedAtIso`, updated every second. Returns 0
 * when `startedAtIso` is null. Optionally capped so a forgotten timer never
 * renders an absurd number before the auto-close cron finalises it server-side.
 */
export function useElapsedSeconds(startedAtIso: string | null, capSeconds?: number): number {
  const now = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!startedAtIso || now === 0) return 0;
  const started = new Date(startedAtIso).getTime();
  const raw = Math.max(0, Math.floor((now - started) / 1000));
  return capSeconds != null ? Math.min(raw, capSeconds) : raw;
}

/**
 * The wall clock, ticking once a second — 0 until the component has hydrated.
 *
 * For relative stamps ("43m ago") rendered from a client component that also
 * server-renders. Reading `Date.now()` inline there is the same hydration trap
 * the elapsed clock fell into: the server writes "42m ago", the browser
 * hydrates a minute later and computes "43m ago", and React tears down the
 * subtree. Callers pass this value into their formatter and fall back to
 * `Date.now()` while it is 0, pairing that render with `suppressHydrationWarning`
 * — the first tick after hydration then corrects the text within a second.
 */
export function useNowMs(): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
