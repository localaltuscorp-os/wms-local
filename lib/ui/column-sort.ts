/**
 * SORTABLE COLUMN HEADINGS — the parts every grid's sort shares.
 *
 * Two grids sort by clicking a heading (the Event Checklist and the JD Bank),
 * and a third will. What they must agree on is not the columns — those differ —
 * but the BEHAVIOUR a reader learns once: what a second click does, what a
 * third does, and where the blanks go. Two copies of that would diverge on the
 * day one of them gained a fourth state.
 *
 * Each grid keeps its own key union and its own value lookups; this module owns
 * the cycle and the comparison.
 */

export type SortDir = "asc" | "desc";

/** `null` is the grid's own order — see `nextSort`. */
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

/**
 * What a header click does: ascending → descending → OFF.
 *
 * The third click matters more than it looks. Every grid that sorts also has a
 * natural order that means something — a checklist's manual sequence, the JD
 * Bank's serial order — and a sort with no way back quietly replaces a
 * deliberate arrangement with an alphabet.
 */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

/** The `aria-sort` value for a header cell. */
export function ariaSort<K extends string>(
  current: SortState<K>,
  key: K,
): "ascending" | "descending" | "none" {
  if (!current || current.key !== key) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
}

/**
 * Compare two cell values, with EMPTY ALWAYS LAST — in both directions.
 *
 * Reversing a column should not hand you a screenful of dashes: the reason to
 * sort by Target, or by Doer, is to read the values, and the blanks are exactly
 * what you are not looking at. So the null rule is not negated by `dir`.
 *
 * Numbers compare as numbers; everything else through `localeCompare` with
 * `numeric`, so "Task 2" sorts before "Task 10".
 */
export function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  const aEmpty = a === null || a === "";
  const bEmpty = b === null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * sign;
}

/** How a direction reads in words, for the "Sorted by …" banner. */
export function directionWords(
  dir: SortDir,
  kind: "text" | "number" | "date" | "state",
): string {
  switch (kind) {
    case "number":
      return dir === "asc" ? "low to high" : "high to low";
    case "date":
      return dir === "asc" ? "earliest first" : "latest first";
    case "state":
      return dir === "asc" ? "outstanding first" : "done first";
    default:
      return dir === "asc" ? "A–Z" : "Z–A";
  }
}
