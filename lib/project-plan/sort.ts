/**
 * SORTING THE PLAN TABLE, one sibling run at a time.
 *
 * Manan, 2026-09-21: "give ascending and descending option to col of the table
 * in project module tables." The hierarchy board had a toolbar box with four
 * orders and no direction; this is what its column headers call instead.
 *
 * It lives in lib/ rather than beside the board for the same reason
 * `progress.ts` does: it is arithmetic over rows, it has nothing to do with
 * React, and out here it can be tested on its own.
 */

/**
 * The shape this module needs from a row — structural, so the board's full
 * `PlanRow` satisfies it without a conversion and nothing has to be mapped.
 */
export interface SortableNode {
  name: string;
  description?: string | null;
  status?: string | null;
  approvalStatus?: string | null;
  progressPercent?: number | null;
  priority?: string | null;
  clientName?: string | null;
  targetDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  ownerName?: string | null;
  task?: {
    statusLabel?: string;
    doerName?: string | null;
    priority?: string;
    dueAt?: string;
  } | null;
  children: SortableNode[];
}

/** Every column that can be sorted. A column absent from here has no arrow. */
export type SortableColumn =
  | "name"
  | "description"
  | "owner"
  | "client"
  | "status"
  | "approver"
  | "progress"
  | "doer"
  | "priority"
  | "target"
  | "startDate"
  | "endDate"
  | "due"
  | "days"
  | "from"
  | "to"
  | "wms";

export type SortDir = "asc" | "desc";

const TEXT = { sensitivity: "base" } as const;

function byText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", undefined, TEXT);
}
function byNum(a: number | null | undefined, b: number | null | undefined): number {
  return (a ?? 0) - (b ?? 0);
}

/** The Days column's value as milliseconds — the column itself renders days. */
function spanMs(n: SortableNode): number | null {
  if (!n.startsAt || !n.endsAt) return null;
  const ms = Date.parse(n.endsAt) - Date.parse(n.startsAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Priority, LEAST urgent first, so ascending reads low → high the way a date
 * column does and "descending" puts the emergencies on top.
 *
 * The order is passed in rather than imported, because the enum lives in `db/`
 * and this module deliberately knows nothing about the schema. It is expected
 * MOST-URGENT-FIRST, which is how `TASK_PRIORITIES` declares it — index 0 is
 * `imp_urgent` — so the rank below counts backwards from the length to turn
 * that round.
 */
function priorityRank(n: SortableNode, order: readonly string[]): number | null {
  const p = n.task?.priority ?? n.priority;
  if (!p) return null;
  const at = order.indexOf(p);
  return at < 0 ? null : order.length - at;
}

/** What a column reads off a row, for the blank test and the comparison. */
function valueOf(n: SortableNode, key: SortableColumn, priorityOrder: readonly string[]): string | number | null {
  switch (key) {
    case "name": return n.name || null;
    case "description": return n.description || null;
    case "owner": return n.ownerName || null;
    case "client": return n.clientName || null;
    case "status": return n.task?.statusLabel || n.status || null;
    case "approver": return n.approvalStatus || null;
    case "doer": return n.task?.doerName || n.ownerName || null;
    case "progress": return n.progressPercent ?? null;
    case "priority": return priorityRank(n, priorityOrder);
    case "target": return n.targetDate || null;
    case "startDate": case "from": return n.startsAt || null;
    case "endDate": case "to": return n.endsAt || null;
    case "due": return n.task?.dueAt || n.targetDate || null;
    case "days": return spanMs(n);
    case "wms": return n.task ? 1 : null;
  }
}

/** A row with nothing in this column. Decides which end it sorts to. */
export function isBlankIn(n: SortableNode, key: SortableColumn, priorityOrder: readonly string[] = []): boolean {
  return valueOf(n, key, priorityOrder) == null;
}

/**
 * Sort every SIBLING RUN, all the way down — never the flat list.
 *
 * The table is a hierarchy: projects hold milestones hold results hold actions.
 * Sorting the rows as one list would tear children away from their parents, so
 * each run of siblings is ordered on its own and the shape survives.
 *
 * BLANKS STAY LAST IN BOTH DIRECTIONS. A row with no owner, no date and no
 * client is not "before A" or "after Z" — it is a row nobody has filled in yet,
 * and opening the reversed view on a block of empty rows is the wrong way round
 * whichever direction was asked for. They are partitioned out before the flip
 * rather than compared, which is what keeps them there.
 */
export function sortPlanTree<T extends SortableNode>(
  nodes: T[],
  key: SortableColumn,
  dir: SortDir = "asc",
  priorityOrder: readonly string[] = [],
): T[] {
  const flip = dir === "desc" ? -1 : 1;
  const filled: T[] = [];
  const blanks: T[] = [];
  for (const n of nodes) (isBlankIn(n, key, priorityOrder) ? blanks : filled).push(n);

  filled.sort((a, b) => {
    const av = valueOf(a, key, priorityOrder);
    const bv = valueOf(b, key, priorityOrder);
    const c = typeof av === "number" || typeof bv === "number"
      ? byNum(av as number, bv as number)
      : byText(av as string, bv as string);
    return c * flip;
  });

  return [...filled, ...blanks].map((n) => ({
    ...n,
    children: sortPlanTree(n.children as T[], key, dir, priorityOrder),
  }));
}
