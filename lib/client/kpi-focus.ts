"use client";

import * as React from "react";
import type { KpiBucketKey } from "@/lib/dashboard/kpi-buckets";

/**
 * WHICH Task Summary card is currently expanded — shared with the widgets
 * further down the dashboard so [ VIEW ] does not just open a panel, it focuses
 * the whole page on that status subset. [ HIDE ] (or clicking the open card
 * again) clears it and every widget returns to the full set.
 *
 * WHY A MODULE STORE AND NOT CONTEXT / THE URL: the same two reasons
 * lib/client/section-search.ts gives.
 *   • Not the URL — a `?kpi=` change would re-run the page's server queries and
 *     re-pay the multi-second rollup scan just to grey out some columns. Every
 *     consumer already holds the rows it needs on the client.
 *   • Not context — the KpiStrip and the sections it focuses are siblings
 *     rendered by a SERVER page component, so a provider would have to be
 *     threaded through the page. `useSyncExternalStore` over a singleton needs
 *     no provider: a widget opts in with one hook call.
 */

let focus: KpiBucketKey | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setKpiFocus(next: KpiBucketKey | null): void {
  // `total` is every countable task, so focusing it filters nothing. Normalise
  // it to null here rather than in each consumer, so no widget has to remember
  // that one of the six keys is a no-op.
  const normalised = next === "total" ? null : next;
  if (normalised === focus) return;
  focus = normalised;
  for (const listener of listeners) listener();
}

/** The focused bucket, or null when the page is showing everything.
 *  The server snapshot is always null so SSR and first paint agree — the store
 *  is only ever written by a click, which happens after hydration. */
export function useKpiFocus(): KpiBucketKey | null {
  return React.useSyncExternalStore(
    subscribe,
    () => focus,
    () => null,
  );
}
