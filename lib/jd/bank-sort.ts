import {
  ariaSort,
  compareValues,
  directionWords,
  nextSort,
  type SortState as GenericSortState,
} from "@/lib/ui/column-sort";

/* The click cycle, the aria value and the empty-last rule are shared with the
   Event Checklist grid — one import for callers, and a reader who has learned
   one grid's headings has learned the other's. */
export { ariaSort, nextSort };

/**
 * SORTING THE JD BANK — pure, so the rule is testable without a DOM.
 *
 * The ten columns are the register's own vocabulary, and three of them do not
 * hold a value you can sort alphabetically at all — Attachment, Add To and Add
 * To Person are SETS. Each sorts by how much it holds, which is the only
 * ordering that answers the question a reader clicking them has: "which of
 * these have an SOP?", "which go to a checklist?", "which are assigned to
 * somebody by name?"
 *
 * Everything sorts by what is ON SCREEN, never by the stored value: Position by
 * its title, Function by its label, Frequency by the sentence the grid prints.
 * Sorting by `function_key` would order Apps/IT under "a" and HR under "h" —
 * correct against the database and wrong against the page.
 */

export type JdSortKey =
  | "sr"
  | "position"
  | "function"
  | "task"
  | "frequency"
  | "estimate"
  | "attachment"
  | "notes"
  | "addto"
  | "person";

/** `null` is the Bank's own order — serial, the sequence they were written in. */
export type JdSortState = GenericSortState<JdSortKey>;

/** The fields this module reads off a JD row. */
export interface JdSortableRow {
  serialNo: string;
  positionTitle: string;
  functionKey: string;
  task: string;
  notesHtml: string | null;
  estimatedMinutes: number;
  videoUrl: string | null;
  guidelinesUrl: string | null;
  templateUrl: string | null;
  pushDcc: boolean;
  pushWms: boolean;
  pushEvent: boolean;
  assignees: string[];
}

/* Generic over the caller's row, so `describeFrequency` receives the REAL row
   — the recurrence is a structured blob this module has no business reading. */
export interface JdSortContext<T extends JdSortableRow = JdSortableRow> {
  /** Function key → the label the grid prints. */
  labelOfFunction: (key: string) => string;
  /** The recurrence sentence the Frequency column shows. */
  describeFrequency: (row: T) => string;
}

/** How many of the three SOP slots this JD actually has. */
export function attachmentCount(r: JdSortableRow): number {
  return (r.videoUrl ? 1 : 0) + (r.guidelinesUrl ? 1 : 0) + (r.templateUrl ? 1 : 0);
}

/** How many checklists this JD is pushed to. */
export function targetCount(r: JdSortableRow): number {
  return (r.pushDcc ? 1 : 0) + (r.pushWms ? 1 : 0) + (r.pushEvent ? 1 : 0);
}

/** Notes as plain text — the column shows a stripped preview, so it sorts on one. */
export function notesText(r: JdSortableRow): string {
  if (!r.notesHtml) return "";
  return r.notesHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The Bank's own order: by serial, which is the order the rows were created in.
 *
 * `numeric` matters — JD-9 must come before JD-10, and a plain string compare
 * puts it after.
 */
export function compareBySerial(a: JdSortableRow, b: JdSortableRow): number {
  return a.serialNo.localeCompare(b.serialNo, undefined, { numeric: true });
}

/**
 * The rows in the order the grid should render them.
 *
 * Returns a NEW array — the input is the server's data, and sorting it in place
 * would survive into the next render as an order nobody chose.
 */
export function sortJdRows<T extends JdSortableRow>(
  rows: readonly T[],
  sort: JdSortState,
  ctx: JdSortContext<T>,
): T[] {
  const out = [...rows];
  if (!sort) return out.sort(compareBySerial);

  const { key, dir } = sort;

  // Sr. No. is a position in the list, not a stored value, so sorting by it can
  // only mean the Bank's order or its reverse.
  if (key === "sr") {
    out.sort((a, b) => (dir === "asc" ? compareBySerial(a, b) : -compareBySerial(a, b)));
    return out;
  }

  const valueOf = (r: T): string | number | null => {
    switch (key) {
      case "position":
        return r.positionTitle;
      case "function":
        return ctx.labelOfFunction(r.functionKey);
      case "task":
        return r.task;
      case "frequency":
        return ctx.describeFrequency(r);
      case "estimate":
        return r.estimatedMinutes;
      case "attachment": {
        // Zero is EMPTY here, not "the lowest number": a JD with no SOP has
        // nothing in the column, and the empty-last rule is what keeps a screen
        // of dashes off the top when the arrow is reversed.
        const n = attachmentCount(r);
        return n === 0 ? null : n;
      }
      case "notes":
        return notesText(r) || null;
      case "addto": {
        const n = targetCount(r);
        return n === 0 ? null : n;
      }
      case "person":
        // The names as printed, so the order matches the column. Unassigned —
        // which means "whoever holds the seat" — sinks.
        return r.assignees.length > 0 ? r.assignees.join(", ") : null;
    }
  };

  out.sort((a, b) => {
    const c = compareValues(valueOf(a), valueOf(b), dir);
    // Ties fall back to the serial, so equal values still read in the order the
    // Bank was written and the sort is stable between renders.
    return c !== 0 ? c : compareBySerial(a, b);
  });
  return out;
}

/** The banner line: "Time Estimated (low to high)". */
export function describeJdSort(
  sort: JdSortState,
  labelOf: (k: JdSortKey) => string,
): string | null {
  if (!sort) return null;
  const kind =
    sort.key === "estimate" ||
    sort.key === "sr" ||
    sort.key === "attachment" ||
    sort.key === "addto"
      ? "number"
      : "text";
  return `${labelOf(sort.key)} (${directionWords(sort.dir, kind)})`;
}
