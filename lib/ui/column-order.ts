/**
 * DRAG-TO-REORDER TABLE COLUMNS — the order rules, pure and client-safe
 * (account holder, 2026-09-18: "drag the columns and put them anywhere, like
 * Tasks"). The Event Checklist grid and Checklist Masters read these; the
 * drag handles themselves are components/ui/column-drag.tsx.
 *
 * A stored order is RECONCILED, never trusted whole: it is a person's browser
 * talking about columns that may since have been added or removed.
 */

/**
 * A saved order made safe: unknown keys and repeats dropped, and any column
 * added since it was saved appended at the end — where a person who has
 * arranged their own columns will see it, rather than slotted between two they
 * placed on purpose.
 */
export function reconcileColumnOrder<K extends string>(saved: unknown, defaults: readonly K[]): K[] {
  const known = new Set<string>(defaults);
  const kept: K[] = [];
  for (const k of Array.isArray(saved) ? saved : []) {
    if (typeof k === "string" && known.has(k) && !kept.includes(k as K)) kept.push(k as K);
  }
  return [...kept, ...defaults.filter((k) => !kept.includes(k))];
}

/**
 * Move `from` to where `to` sits now. Dropped on a column to its right it lands
 * AFTER that column, to its left BEFORE it — the edge the drop line was drawn
 * on. Anything unknown leaves the order as it was.
 */
export function moveColumnKey<K extends string>(order: readonly K[], from: K, to: K): K[] {
  const fi = order.indexOf(from);
  const ti = order.indexOf(to);
  if (from === to || fi < 0 || ti < 0) return [...order];
  const next = order.filter((k) => k !== from);
  const at = next.indexOf(to);
  next.splice(fi < ti ? at + 1 : at, 0, from);
  return next;
}

/** Is this order anything other than the table's own? */
export function isReordered<K extends string>(order: readonly K[], defaults: readonly K[]): boolean {
  return order.length !== defaults.length || order.some((k, i) => k !== defaults[i]);
}
