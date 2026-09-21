/**
 * WCC / MCC TABLE COLUMNS — their headings, widths, the order a person has
 * dragged them into, and how each one sorts (account holder, 2026-09-18:
 * "ascending, descending, and drag to put a column anywhere, like Tasks").
 *
 * PURE and client-safe, so the rules are tested without a DOM.
 *
 * ── SORTING HAPPENS INSIDE A GROUP ───────────────────────────────────────
 * The table is grouped — by day or month for one person, by team for the full
 * team — and a sort orders the rows WITHIN each group, the way the Event
 * Checklist sorts within Before / During / After. Mixing Tuesday's rows into
 * Thursday's by a notes column would give a list nobody can work from.
 * Click once for ascending, again for descending, a third time for the
 * checklist's own order (lib/ui/column-sort).
 *
 * ── A PERSON'S COLUMN ORDER IS THEIRS ────────────────────────────────────
 * Saved per employee in the browser, exactly as the Tasks table saves its own
 * (components/tasks/task-table.tsx). A stored order is RECONCILED, never
 * trusted whole: a column added since is appended, one removed is dropped.
 */

import { compareValues, type SortDir, type SortState } from "@/lib/ui/column-sort";
import { APPROVER_CHOICES } from "@/lib/status/approver-status";
import type { ComplianceKind } from "./schedule";
import type { ComplianceRow } from "./rows";
import type { DoerStatus } from "./status";

export type ColKey =
  | "sr"
  | "employee"
  | "compliance"
  | "frequency"
  | "deadline"
  | "doerStatus"
  | "actual"
  | "var"
  | "approver"
  | "doerNotes"
  | "approverNotes"
  | "actions";

export interface ColumnDef {
  key: ColKey;
  width: number;
  /** Sortable columns get the ⇅ button; S. No. sorts as the checklist's order. */
  sortable: boolean;
  /** The actions column stays on the right, where the row's buttons belong. */
  movable: boolean;
  /** Only in the team view. */
  teamOnly?: true;
  align?: "right";
  /** What the column means, on hover. */
  hint?: string;
  sortKind: "text" | "number" | "date" | "state";
}

export const COLUMNS: Record<ColKey, ColumnDef> = {
  sr: { key: "sr", width: 80, sortable: true, movable: true, sortKind: "number" },
  employee: { key: "employee", width: 180, sortable: true, movable: true, teamOnly: true, sortKind: "text" },
  compliance: { key: "compliance", width: 330, sortable: true, movable: true, sortKind: "text" },
  frequency: { key: "frequency", width: 170, sortable: true, movable: true, sortKind: "text" },
  deadline: { key: "deadline", width: 150, sortable: true, movable: true, sortKind: "date", hint: "The day it is due." },
  doerStatus: { key: "doerStatus", width: 175, sortable: true, movable: true, sortKind: "state" },
  actual: {
    key: "actual",
    width: 150,
    sortable: true,
    movable: true,
    sortKind: "date",
    hint: "When the doer marked it Done — recorded by the system.",
  },
  var: {
    key: "var",
    width: 120,
    sortable: true,
    movable: true,
    align: "right",
    sortKind: "number",
    hint: "Actual Date against the Deadline. Positive is late; a … means still open and late.",
  },
  approver: { key: "approver", width: 185, sortable: true, movable: true, sortKind: "state" },
  doerNotes: { key: "doerNotes", width: 250, sortable: true, movable: true, sortKind: "text" },
  approverNotes: { key: "approverNotes", width: 250, sortable: true, movable: true, sortKind: "text" },
  actions: { key: "actions", width: 90, sortable: false, movable: false, sortKind: "text" },
};

/** The headings, written out in full — the table and the sort banner both read them. */
export function columnLabel(key: ColKey, kind: ComplianceKind): string {
  switch (key) {
    case "sr":
      return "S. No.";
    case "employee":
      return "Employee";
    case "compliance":
      return kind === "wcc" ? "Weekly Compliance" : "Monthly Compliance";
    case "frequency":
      return "Frequency";
    case "deadline":
      return "Deadline";
    case "doerStatus":
      return "Doer Status";
    case "actual":
      return "Actual Date";
    case "var":
      return "+/- Days";
    case "approver":
      return "Approver Status";
    case "doerNotes":
      return "Doer Notes";
    case "approverNotes":
      return "Approver Notes";
    case "actions":
      return "";
  }
}

/** The order the table opens in, before anybody drags anything. */
export const DEFAULT_ORDER: ColKey[] = [
  "sr",
  "employee",
  "compliance",
  "frequency",
  "deadline",
  "doerStatus",
  "actual",
  "var",
  "approver",
  "doerNotes",
  "approverNotes",
  "actions",
];

/**
 * A stored order made safe: unknown keys and repeats dropped, columns added
 * since appended (the Tasks table's rule), the actions column always last.
 */
export function reconcileOrder(saved: readonly string[] | null | undefined): ColKey[] {
  const known = new Set<string>(DEFAULT_ORDER);
  const kept = (saved ?? []).filter(
    (k, i, all): k is ColKey => known.has(k) && all.indexOf(k) === i && k !== "actions",
  );
  const added = DEFAULT_ORDER.filter((k) => k !== "actions" && !kept.includes(k));
  return [...kept, ...added, "actions"];
}

/** Move `from` to where `to` sits now. The actions column never moves. */
export function moveColumn(order: readonly ColKey[], from: ColKey, to: ColKey): ColKey[] {
  if (from === to || !COLUMNS[from].movable || !COLUMNS[to].movable) return [...order];
  const next = order.filter((k) => k !== from);
  const at = next.indexOf(to);
  if (at < 0) return [...order];
  // Dropping on a column to the right lands after it; to the left, before it.
  next.splice(order.indexOf(from) < order.indexOf(to) ? at + 1 : at, 0, from);
  return next;
}

/** The columns a view shows, in this person's order. */
export function visibleColumns(order: readonly ColKey[], multiPerson: boolean): ColKey[] {
  return order.filter((k) => multiPerson || !COLUMNS[k].teamOnly);
}

/* ── Sorting ─────────────────────────────────────────────────────────────── */

/** Outstanding first: not filled, then the WMS statuses up to Done. */
const DOER_RANK: Record<DoerStatus | "none", number> = {
  none: 0,
  dont_know: 1,
  not_started: 2,
  need_info: 3,
  follow_up: 4,
  initiated: 5,
  done: 6,
  // Terminal like Done, but a dead end — it sorts past it, never before.
  abandoned: 7,
};

function valueOf(r: ComplianceRow, key: ColKey): string | number | null {
  switch (key) {
    case "employee":
      return r.ownerName;
    case "compliance":
      return r.title;
    case "frequency":
      return r.schedule;
    case "deadline":
      return r.deadline;
    case "doerStatus":
      return DOER_RANK[r.doerStatus ?? "none"];
    case "actual":
      return r.doneAt;
    case "var":
      return r.variance;
    case "approver":
      return APPROVER_CHOICES.indexOf(r.approver as never);
    case "doerNotes":
      return r.doerNotes?.trim() || null;
    case "approverNotes":
      return r.approverNotes?.trim() || null;
    default:
      return null;
  }
}

/**
 * One group's rows in the order to show them. S. No. is the checklist's own
 * order forwards or backwards; everything else compares its values, blanks
 * last in both directions, ties falling back to the checklist's order.
 */
export function sortRows(rows: readonly ComplianceRow[], sort: SortState<ColKey>): ComplianceRow[] {
  const natural = rows.map((r, i) => [r, i] as const);
  if (!sort) return rows.slice();
  const { key, dir } = sort;
  if (key === "sr") return dir === "asc" ? rows.slice() : rows.slice().reverse();
  return natural
    .slice()
    .sort(([a, ai], [b, bi]) => compareValues(valueOf(a, key), valueOf(b, key), dir as SortDir) || ai - bi)
    .map(([r]) => r);
}
