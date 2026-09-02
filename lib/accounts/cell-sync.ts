/**
 * RECONCILING A TYPED-IN GRID WITH THE SERVER'S VERSION OF IT.
 *
 * ── THE BUG THIS EXISTS TO FIX ─────────────────────────────────────────────
 * The Bank Balance grid held its cells in one state object and refilled the
 * WHOLE object from the server on every change to the `balances` prop:
 *
 *     useEffect(() => { setGrid(fromServer(balances)); }, [balances]);
 *
 * Every cell write calls `revalidatePath`, so each save pushes a fresh
 * `balances` array down and that effect fires. Anything the user had typed
 * since — in any cell, not just the saved one — was replaced by the server's
 * older value and looked, correctly, like the entry had been thrown away.
 *
 * The race is worse than the flicker: save A, start typing in B, A's refresh
 * lands carrying a snapshot taken before B was written, and B is reverted on
 * screen while B's own write is still in flight.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * The server owns every cell EXCEPT the ones the user is still responsible
 * for: cells with unsaved keystrokes, and cells whose write has not come back
 * yet. For those the local value stands, because it is newer by definition —
 * the server has not been told about it.
 *
 * PURE and exhaustively testable, which matters more here than anywhere else
 * in the grid: this is the function that decides whether someone's typing
 * survives, and it runs on data that only exists mid-interaction.
 */

/** A grid of cell values keyed by whatever the caller uses (`itemId:weekId`). */
export type CellMap = Record<string, string>;

/**
 * Fold a fresh server snapshot into what is currently on screen.
 *
 * - Every server cell wins, unless its key is protected.
 * - A cell the server no longer has is dropped, unless its key is protected —
 *   that is how a cleared cell disappears without taking a fresh entry with it.
 * - A protected key keeps its on-screen value verbatim, even when the server
 *   has never heard of it (a brand-new entry mid-flight).
 *
 * Returns the SAME object identity when nothing would change, so callers can
 * skip a needless re-render — a grid that re-renders on every revalidate steals
 * focus and drops the caret.
 */
export function mergeServerCells(opts: {
  /** What the server just sent, already flattened to key → value. */
  server: CellMap;
  /** What is on screen right now. */
  current: CellMap;
  /** Keys the user still owns: unsaved keystrokes, or writes in flight. */
  protectedKeys: Iterable<string>;
}): CellMap {
  const guard = opts.protectedKeys instanceof Set
    ? opts.protectedKeys
    : new Set(opts.protectedKeys);

  const next: CellMap = {};
  for (const [k, v] of Object.entries(opts.server)) {
    if (!guard.has(k)) next[k] = v;
  }
  // Protected keys are layered on afterwards so they beat the server copy even
  // when both have the cell.
  for (const k of guard) {
    const local = opts.current[k];
    if (local !== undefined && local !== "") next[k] = local;
  }

  return sameCells(opts.current, next) ? opts.current : next;
}

/** Shallow value equality over two cell maps. */
export function sameCells(a: CellMap, b: CellMap): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Should this write be applied, or has a newer edit to the same cell already
 * overtaken it?
 *
 * Each edit takes a monotonically increasing ticket. A response is only allowed
 * to settle the cell if its ticket is still the latest one issued for that
 * cell; otherwise the user has typed again since and the older answer — success
 * or failure — must not touch the screen. Without this, a slow save landing
 * after a fast one restores the value the user just replaced.
 */
export function isLatestWrite(
  seq: Map<string, number>,
  key: string,
  ticket: number,
): boolean {
  return (seq.get(key) ?? 0) === ticket;
}
