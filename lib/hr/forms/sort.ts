/**
 * Row ordering for the Filled Forms tables.
 *
 * PURE and in `lib/` rather than beside the table component so it can be tested
 * without dragging a `"use client"` module — and its `next/link` and lucide
 * imports — into a node test environment. Typed structurally against the two
 * fields it actually reads, so it needs nothing from the component either.
 */

export type FilledFormSortKey = "newest" | "oldest" | "employee";

/** The minimum a row must expose to be ordered. `FilledFormRow` satisfies it. */
export interface SortableFormRow {
  /** Submission timestamp in ms; 0 for a row that was never submitted. */
  submittedTs: number;
  employeeName?: string;
}

/**
 * Comparator for the given sort mode.
 *
 * The "oldest" branch is the reason this is worth testing. Undated drafts sort
 * after everything dated — but that rule may only fire when EXACTLY ONE side is
 * undated. The original wrote `if (a === 0 || b === 0) return a === 0 ? 1 : -1`,
 * which for two undated rows returns 1 for (a,b) AND 1 for (b,a): a claim that
 * each is greater than the other. On the Drafts tab every row is undated, so
 * that was the entire list, and the resulting order was whatever the engine's
 * sort happened to produce.
 */
export function compareRows<T extends SortableFormRow>(
  sort: FilledFormSortKey,
): (a: T, b: T) => number {
  return (a, b) => {
    if (sort === "employee") {
      return (
        (a.employeeName ?? "").localeCompare(b.employeeName ?? "") ||
        b.submittedTs - a.submittedTs
      );
    }
    if (sort === "oldest") {
      const aUndated = a.submittedTs === 0;
      const bUndated = b.submittedTs === 0;
      if (aUndated !== bUndated) return aUndated ? 1 : -1;
      return a.submittedTs - b.submittedTs;
    }
    return b.submittedTs - a.submittedTs;
  };
}
