"use client";

import * as React from "react";

/**
 * Section-scoped search — the text typed into the FilterBar's search box,
 * shared with whatever view is rendered beneath it.
 *
 * WHY A MODULE STORE AND NOT THE URL: every other FilterBar control writes to
 * the query string, which re-runs the page's server queries. That's right for
 * coarse filters that change rarely, but wrong per-keystroke — on Dashboard a
 * single `?q=` change would re-issue the whole rollup scan. This search filters
 * rows ALREADY loaded on the client, so it stays instant and costs no round
 * trip. Trade-off, deliberately accepted: the text is not shareable/bookmarkable
 * the way `?status=` is.
 *
 * WHY NOT CONTEXT: the FilterBar and the view it filters are siblings rendered
 * by a SERVER page component, so a provider would have to be threaded through
 * all four pages. `useSyncExternalStore` over a module singleton needs no
 * provider, so views opt in with one hook call and pages stay untouched.
 */

let query = "";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSectionSearch(next: string): void {
  if (next === query) return;
  query = next;
  for (const listener of listeners) listener();
}

/** Read the current text without subscribing (event handlers, effects). */
export function getSectionSearch(): string {
  return query;
}

/**
 * The live search text, lowercased + trimmed — the form every consumer wants.
 * The server snapshot is always "" so SSR and first client paint agree; the
 * store is only ever written by user typing, which happens after hydration.
 */
export function useSectionSearch(): string {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => query,
    () => "",
  );
  return React.useMemo(() => raw.trim().toLowerCase(), [raw]);
}

/**
 * True when `haystack` contains the query. Null/undefined fields are skipped,
 * and an empty query matches everything — so callers can write
 * `if (!q) return rows;` or lean on this directly.
 */
export function matchesSearch(q: string, ...haystack: (string | null | undefined)[]): boolean {
  if (!q) return true;
  return haystack.some((value) => !!value && value.toLowerCase().includes(q));
}
