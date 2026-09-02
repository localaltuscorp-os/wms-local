/**
 * ORDERING FOR THE DAILY GOALS KANBAN — the board's "Oldest → Newest" control.
 *
 * PURE (no React, no server imports) so the rule itself can be unit-tested
 * without rendering a board or touching a database.
 *
 * WHAT "OLDEST" MEANS HERE. A day column holds work of three different ages:
 * a task materialised onto today at 6am, a goal pulled in at 9, a commitment
 * typed at noon. The honest ordering key is therefore WHEN THE ROW WAS
 * COMMITTED TO THE PLAN (`daily_checklist.created_at`), not the linked task's
 * due date — two rows can reference tasks due the same day yet have been
 * planned a week apart, and it is the planning act this board is about.
 *
 * THE MANUAL ORDER IS NEVER LOST. Drag-to-reorder still writes `position`, and
 * the board hands items to this function in that order — so the array index is
 * the FINAL tiebreaker in both directions. Rows committed in the same moment
 * (a bulk materialisation, most commonly) keep exactly the order the user
 * dragged them into. Sorting is a view over the plan, not a rewrite of it.
 */

export type PlanSort = "oldest" | "newest";

/**
 * The default the board opens on, always — see the product rule. Exported so
 * the board and its tests name the same value rather than repeating a literal.
 */
export const PLAN_SORT_DEFAULT: PlanSort = "oldest";

export const PLAN_SORT_LABELS: Record<PlanSort, string> = {
  oldest: "Oldest → Newest",
  newest: "Newest → Oldest",
};

/** The only fields the ordering reads — kept structural so `PlanItem` satisfies
 *  it without this module having to know about the board's types. */
export interface PlanSortable {
  /** `daily_checklist.created_at` as epoch ms. Absent on optimistic rows that
   *  have not come back from the server yet. */
  createdAtMs?: number | null;
  /** Minutes from midnight — when in the day the work is booked. Null =
   *  "Anytime", which has no position in a clock ordering. */
  startMin?: number | null;
}

/**
 * Compare on one nullable number, NULLS ALWAYS LAST — in both directions.
 *
 * Deliberately not "reverse the whole comparison": flipping to Newest → Oldest
 * must not promote the rows whose age is simply unknown to the top of the
 * column. Unknown sorts last whichever way the list is pointing.
 */
function cmpNullsLast(a: number | null | undefined, b: number | null | undefined, dir: PlanSort): number {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av === bv) return 0;
  return dir === "oldest" ? av - bv : bv - av;
}

/**
 * Order one day column's items. Returns a NEW array; the input is untouched, so
 * this is safe to call straight out of a `useMemo` over server state.
 */
export function sortPlanItems<T extends PlanSortable>(items: readonly T[], dir: PlanSort): T[] {
  // Index carried alongside so the sort is stable on the manual order even
  // where the engine's own stability would not be guaranteed.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byAge = cmpNullsLast(a.item.createdAtMs, b.item.createdAtMs, dir);
      if (byAge !== 0) return byAge;
      const byClock = cmpNullsLast(a.item.startMin, b.item.startMin, dir);
      if (byClock !== 0) return byClock;
      // Same age, same slot → whatever order the plan already had.
      return a.index - b.index;
    })
    .map((e) => e.item);
}
