"use client";

/**
 * Coalesced background reconcile (Operation Butter P1).
 *
 * After an OPTIMISTIC mutation the UI has already moved — the user sees the new
 * status/column the instant they click. The only thing left is to reconcile
 * server-DERIVED fields the client can't compute locally (e.g. `completedAt`
 * and the "Late" badge on entry to done, the 6 stat cards, goal-mirror %). The
 * old code did a full `router.refresh()` on EVERY successful click, re-fetching
 * the entire view once per mutation — five quick status flips = five full
 * server round-trips + re-renders.
 *
 * `scheduleReconcile` folds a burst of mutations into a SINGLE refresh: it
 * fires ~`delayMs` after the last call (so a rapid burst settles into one
 * refresh), but never waits longer than `maxWaitMs` even under sustained
 * editing (so it can't starve). On Vercel the realtime LiveIndicator already
 * reconciles other clients; this also covers the actor's own derived fields and
 * the local-server installs where realtime is disabled.
 *
 * Module-level (not per-component) on purpose: a flip in the table and a drag
 * in the kanban should share one reconcile window, not schedule two.
 */

let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRefresh: (() => void) | null = null;

function flush() {
  if (trailingTimer) {
    clearTimeout(trailingTimer);
    trailingTimer = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  const fn = pendingRefresh;
  pendingRefresh = null;
  fn?.();
}

export function scheduleReconcile(
  refresh: () => void,
  delayMs = 1000,
  maxWaitMs = 3000,
): void {
  // Always reconcile against the most recent router instance.
  pendingRefresh = refresh;
  if (trailingTimer) clearTimeout(trailingTimer);
  trailingTimer = setTimeout(flush, delayMs);
  // Arm the ceiling once per burst so sustained editing still reconciles.
  if (!maxTimer) maxTimer = setTimeout(flush, maxWaitMs);
}
