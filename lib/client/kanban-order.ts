"use client";

/**
 * Per-column CARD ORDER for the status Kanban.
 *
 * The board's server query orders tasks `desc(createdAt)` — newest first — and
 * there is no per-task board position in the schema. Dropping a card at an
 * exact index therefore has to be remembered on the client, or the reconcile
 * refresh that follows every drop (`scheduleReconcile`) would re-sort the
 * column back to created-at order and the card would visibly jump.
 *
 * The shape is `columnId → ordered task ids`. Only columns the user has
 * actually arranged get an entry; everything else keeps the server order.
 *
 * Stored in localStorage, NOT the DB, on purpose — same reasoning as
 * `display-scale`: this is a personal arrangement of one person's board, and
 * persisting it server-side would need a schema migration plus a shared-order
 * conflict story. Read is best-effort; a corrupt/absent value just means "no
 * arrangement yet".
 */

export const KANBAN_ORDER_KEY = "altus.kanbanOrder.v1";

/** columnId → the ids of that column's cards, in the order the user arranged. */
export type BoardOrder = Record<string, string[]>;

export function readBoardOrder(): BoardOrder {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KANBAN_ORDER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BoardOrder = {};
    for (const [col, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[col] = ids.filter((id): id is string => typeof id === "string");
    }
    return out;
  } catch {
    return {};
  }
}

export function writeBoardOrder(order: BoardOrder): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KANBAN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Private mode / quota — the board still works, the arrangement is just
    // session-only.
  }
}

/**
 * Sort one column's cards by the user's arrangement.
 *
 * Ids the arrangement doesn't mention (a task created since, or one that just
 * landed in this column from the list view) stay at the TOP, which is where
 * the server's newest-first order would have put them — so a new task is never
 * buried at the bottom of a column that happens to have been arranged once.
 * Stale ids in `order` (cards that have since moved elsewhere) simply never
 * match and are ignored.
 */
export function applyBoardOrder<T extends { id: string }>(
  list: T[],
  order: string[] | undefined,
): T[] {
  if (!order || order.length === 0 || list.length === 0) return list;
  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id, i));
  const arranged: T[] = [];
  const fresh: T[] = [];
  for (const item of list) (rank.has(item.id) ? arranged : fresh).push(item);
  if (arranged.length === 0) return list;
  arranged.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return fresh.length === 0 ? arranged : [...fresh, ...arranged];
}
