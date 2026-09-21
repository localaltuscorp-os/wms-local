import type { CheckStatus } from "./checklist";
import { APPROVER_CHOICES, approverShown } from "@/lib/status/approver-status";
import {
  ariaSort,
  compareValues,
  directionWords,
  nextSort,
  type SortDir,
  type SortState as GenericSortState,
} from "@/lib/ui/column-sort";

/* The click cycle, the aria value and the empty-last rule are shared with
   every other sortable grid — re-exported here so callers of this module
   still have one import, and the behaviour cannot drift between grids. */
export { ariaSort, nextSort };
export type { SortDir };

/**
 * SORTING THE CHECKLIST GRID — pure, so the rule can be tested without a DOM.
 *
 * ── SORTING HAPPENS INSIDE A PHASE, NEVER ACROSS ONE ─────────────────────
 * Before / During / After is the plan's structure, not a grouping someone
 * applied for convenience: a task three days before the event and a task ten
 * days after it are not comparable work, and interleaving them by doer name
 * would produce a list nobody could execute. So each phase sorts its own rows
 * and the phases keep their order. The caller sorts one group at a time.
 *
 * ── THE THIRD CLICK RETURNS THE PLAN ─────────────────────────────────────
 * Rows carry a MANUAL order — people arrange a checklist deliberately, and that
 * arrangement is data. A sort that could not be undone would quietly replace it
 * with an alphabet. Ascending → descending → off, and "off" is the arrangement
 * the checklist was built in.
 *
 * ── EMPTY CELLS SINK, IN BOTH DIRECTIONS ─────────────────────────────────
 * A row with no doer, no target date or no variance sorts last whichever way
 * the arrow points. Reversing a column should not hand you a screenful of
 * dashes — the reason to sort by Target is to see dates, and the blanks are
 * exactly what you are not looking at.
 */

export type SortKey =
  | "sr"
  | "client"
  | "subject"
  | "activity"
  | "doer"
  | "initiator"
  | "target"
  | "frequency"
  | "done"
  | "notes"
  | "actual"
  | "var"
  | "approver"
  | "approverNotes";

/** `null` is the checklist's own order — see "the third click" above. */
export type SortState = GenericSortState<SortKey>;

/**
 * How the Doer Statuses rank when you sort by them.
 *
 * Ascending puts OUTSTANDING WORK FIRST, which is what the column is asked for
 * ninety times in a hundred — "what is left?" — and descending answers the
 * other question. Unread work is the most outstanding of all.
 */
const STATUS_RANK: Record<CheckStatus, number> = {
  dont_know: 0,
  not_started: 1,
  need_info: 2,
  follow_up: 3,
  initiated: 4,
  done: 5,
};

/** The fields of a row this module reads. Anything wider is the caller's. */
export interface SortableRow {
  offsetDays: number | null;
  sortOrder: number;
  title: string;
  client: string | null;
  category: string | null;
  doerId: string | null;
  initiatorId: string | null;
  status: CheckStatus;
  notes: string | null;
  doneAt: string | null;
  approverStatus: string | null;
  approverNotes: string | null;
}

export interface SortContext<T extends SortableRow> {
  /** Person id → the name ON SCREEN. Sorting by a uuid would be meaningless. */
  nameOf: (id: string | null) => string | null;
  /** The row's target date as `YYYY-MM-DD` — derived, so the caller supplies it. */
  targetOf: (row: T) => string | null;
  /** The row's ± days figure, or null when it has none. */
  varianceOf: (row: T) => number | null;
  /** The Frequency column's words for the row. */
  frequencyOf: (row: T) => string | null;
  /** The checklist's own order: the tie-break, and what "no sort" means. */
  natural: (a: T, b: T) => number;
}

/**
 * One phase's rows in the order the grid should render them.
 *
 * Returns a NEW array; the input is never mutated, because the caller's copy is
 * the server's data and a sort that reordered it in place would survive into
 * the next render as a "manual" order nobody chose.
 */
export function sortChecklistRows<T extends SortableRow>(
  rows: readonly T[],
  sort: SortState,
  ctx: SortContext<T>,
): T[] {
  const out = [...rows];
  if (!sort) return out.sort(ctx.natural);

  const { key, dir } = sort;

  // S.No is the position in the plan, so sorting by it IS the plan's order —
  // ascending as built, descending reversed. No separate value to compare.
  if (key === "sr") {
    out.sort((a, b) => (dir === "asc" ? ctx.natural(a, b) : -ctx.natural(a, b)));
    return out;
  }

  const valueOf = (r: T): string | number | null => {
    switch (key) {
      case "client":
        return r.client?.trim() || null;
      case "subject":
        return r.category?.trim() || null;
      case "activity":
        return r.title;
      case "doer":
        return ctx.nameOf(r.doerId);
      case "initiator":
        return ctx.nameOf(r.initiatorId);
      case "target":
        // `YYYY-MM-DD` sorts lexicographically in date order — no parsing, and
        // no timezone to get wrong.
        return ctx.targetOf(r);
      case "frequency":
        return ctx.frequencyOf(r);
      case "done":
        return STATUS_RANK[r.status];
      case "notes":
        return r.notes?.trim() || null;
      case "actual":
        // ISO timestamps, same property as above.
        return r.doneAt;
      case "var":
        return ctx.varianceOf(r);
      case "approver":
        return APPROVER_CHOICES.indexOf(approverShown(r.approverStatus) as never);
      case "approverNotes":
        return r.approverNotes?.trim() || null;
    }
  };

  out.sort((a, b) => {
    const c = compareValues(valueOf(a), valueOf(b), dir);
    // Ties fall back to the plan, so the order is stable and a column of equal
    // values (every row Pending, say) still reads as the checklist was written.
    return c !== 0 ? c : ctx.natural(a, b);
  });
  return out;
}

/** The label under the sort banner: "Doer (A–Z)". */
export function describeSort(sort: SortState, labelOf: (k: SortKey) => string): string | null {
  if (!sort) return null;
  const kind =
    sort.key === "var" || sort.key === "sr"
      ? "number"
      : sort.key === "target" || sort.key === "actual"
        ? "date"
        : sort.key === "done" || sort.key === "approver"
          ? "state"
          : "text";
  return `${labelOf(sort.key)} (${directionWords(sort.dir, kind)})`;
}
