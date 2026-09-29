/**
 * WCC / MCC TABLE COLUMNS — their headings, widths, the order a person has
 * dragged them into, and how each one sorts (account holder, 2026-09-18:
 * "ascending, descending, and drag to put a column anywhere, like Tasks").
 *
 * PURE and client-safe, so the rules are tested without a DOM.
 *
 * ── SORTING HAPPENS INSIDE A GROUP ───────────────────────────────────────
 * The table is grouped — WCC by Daily, then each day of the week (inside each
 * team, for the full team); MCC by month for one person, by team for the full
 * team — and a sort orders the rows WITHIN each group, the way the Event
 * Checklist sorts within Before / During / After. Mixing Tuesday's rows into
 * Thursday's by a notes column would give a list nobody can work from.
 * Click once for ascending, again for descending, a third time for the
 * checklist's own order (lib/ui/column-sort).
 *
 * ── A PERSON'S COLUMN ORDER IS THEIRS ────────────────────────────────────
 * Saved per employee in the browser, exactly as the Tasks table saves its own
 * (components/tasks/task-table.tsx). A stored order is RECONCILED, never
 * trusted whole: one removed is dropped, and a column added since goes in
 * after the column it follows by default — so WCC's Mins lands where that
 * person keeps Deadline.
 *
 * ── WCC HAS MINS WHERE MCC HAS DEADLINE (account holder, 2026-09-19) ─────
 * "Remove Deadline, but add Mins": WCC's groups carry the day (Daily, then
 * Monday, Tuesday… — lib/compliance/wcc-groups.ts), so its Deadline column
 * gives way to Mins, how many minutes each compliance takes. MCC keeps its
 * Deadline — three deadlines a month look alike without it — and has no Mins.
 *
 * ── MCC'S FREQUENCY IS THE DAY ALONE (account holder, 2026-09-19) ────────
 * "No words, just the month day no.": MCC's Frequency column shows the day of
 * the month each row is due — 2nd, 15th, 30th — as a red pill, the way the
 * Accounts monthly checklist shows its deadlines; "Quarterly — by the 30th ·
 * Sep, Dec, Mar, Jun" is on hover. So on MCC the column is narrow and sorts by
 * that day (columnDef). WCC's Frequency is unchanged.
 */

import { compareValues, type SortDir, type SortState } from "@/lib/ui/column-sort";
import { APPROVER_CHOICES } from "@/lib/status/approver-status";
import type { ComplianceKind } from "./schedule";
import type { ComplianceRow } from "./rows";
import type { DoerStatus } from "./status";

export type ColKey =
  | "select"
  | "sr"
  | "employee"
  | "compliance"
  | "section"
  | "frequency"
  | "deadline"
  | "mins"
  | "doerStatus"
  | "qty"
  | "actual"
  | "var"
  | "approver"
  | "doerNotes"
  | "approverNotes"
  | "edit"
  | "delete";

export interface ColumnDef {
  key: ColKey;
  width: number;
  /** Sortable columns get the ⇅ button; S. No. sorts as the checklist's order. */
  sortable: boolean;
  /** Positional columns cannot be dragged out of their frozen rail. */
  movable: boolean;
  /** Only in the team view. */
  teamOnly?: true;
  /** Only on this checklist. */
  only?: ComplianceKind;
  align?: "right";
  /** What the column means, on hover. */
  hint?: string;
  sortKind: "text" | "number" | "date" | "state";
}

export const COLUMNS: Record<ColKey, ColumnDef> = {
  // Selection, identity and removal are positional table furniture. They stay
  // reachable while the rest of the checklist scrolls, just like Tasks.
  select: { key: "select", width: 52, sortable: false, movable: false, sortKind: "text" },
  sr: { key: "sr", width: 80, sortable: true, movable: false, sortKind: "number" },
  employee: { key: "employee", width: 180, sortable: true, movable: true, teamOnly: true, sortKind: "text" },
  compliance: { key: "compliance", width: 330, sortable: true, movable: false, sortKind: "text" },
  section: { key: "section", width: 150, sortable: true, movable: false, sortKind: "text" },
  // WCC's — "Mon, Tue, Wed, Thu & Fri" on one line. MCC's is narrower: columnDef.
  frequency: { key: "frequency", width: 215, sortable: true, movable: true, sortKind: "text" },
  // WCC is grouped by day and shows Mins in this slot; only MCC needs a
  // separate due-date column. Keeping the constraint on the definition means
  // saved column orders cannot accidentally restore Deadline on WCC.
  deadline: { key: "deadline", width: 150, sortable: true, movable: true, only: "mcc", sortKind: "date", hint: "The day it is due, shown as DD-MMM-YYYY." },
  mins: {
    key: "mins",
    width: 120,
    sortable: true,
    movable: true,
    only: "wcc",
    align: "right",
    sortKind: "number",
    hint: "How many minutes it takes, each time it is due — added up for each group.",
  },
  // Wide enough for "Carried forward · open till Sat 19 Sep" on one line.
  doerStatus: { key: "doerStatus", width: 215, sortable: true, movable: true, sortKind: "state" },
  qty: {
    key: "qty",
    width: 150,
    sortable: true,
    movable: true,
    sortKind: "number",
    hint: "How many were completed against the target — asked when a compliance with a target above one is marked Done.",
  },
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
    hint: "The Actual Date against the day it was due. Positive is late; a … means still open and late.",
  },
  approver: { key: "approver", width: 185, sortable: true, movable: true, sortKind: "state" },
  doerNotes: { key: "doerNotes", width: 250, sortable: true, movable: true, sortKind: "text" },
  approverNotes: { key: "approverNotes", width: 250, sortable: true, movable: true, sortKind: "text" },
  // Edit remains a normal scrolling control because it is a detail/notes
  // helper. Delete is the one destructive action that stays on the right edge.
  edit: { key: "edit", width: 44, sortable: false, movable: true, sortKind: "text" },
  delete: { key: "delete", width: 52, sortable: false, movable: false, sortKind: "text" },
};

/** MCC's Frequency: the day of the month alone ("2nd", "30th"), so narrow and numeric. */
const MCC_FREQUENCY: ColumnDef = {
  ...COLUMNS.frequency,
  width: 140,
  sortKind: "number",
  hint: "The day of the month it is due — hover a day to see how often it comes round.",
};

/** A column on this checklist — its width, how it sorts, what it means on hover. */
export function columnDef(key: ColKey, kind: ComplianceKind): ColumnDef {
  return key === "frequency" && kind === "mcc" ? MCC_FREQUENCY : COLUMNS[key];
}

/** The headings, written out in full — the table and the sort banner both read them. */
export function columnLabel(key: ColKey, kind: ComplianceKind): string {
  switch (key) {
    case "select":
      return "";
    case "sr":
      return "S. No.";
    case "employee":
      return "Employee";
    case "compliance":
      return kind === "wcc" ? "Weekly Compliance" : "Monthly Compliance";
    case "section":
      return "Section";
    case "frequency":
      return "Frequency";
    case "deadline":
      return "Deadline";
    case "mins":
      return "Mins";
    case "doerStatus":
      return "Doer Status";
    case "qty":
      return "Quantity Done";
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
    case "edit":
    case "delete":
      return "";
  }
}

/** The order the table opens in, before anybody drags anything. */
export const DEFAULT_ORDER: ColKey[] = [
  "select",
  "sr",
  "compliance",
  "section",
  "employee",
  "frequency",
  "deadline",
  "mins",
  "doerStatus",
  "qty",
  "actual",
  "var",
  "approver",
  "doerNotes",
  "approverNotes",
  "delete",
];

/**
 * A stored order made safe: unknown keys and repeats dropped, a column added
 * since placed right after the one it follows by default (Mins after Deadline,
 * wherever this person keeps Deadline). Selection, S. No. and Compliance are
 * always the fixed identity block on the left; Delete is the fixed right rail.
 */
export function reconcileOrder(saved: readonly string[] | null | undefined): ColKey[] {
  const known = new Set<string>(DEFAULT_ORDER);
  const fixedStart: ColKey[] = ["select", "sr", "compliance", "section"];
  const fixedEnd: ColKey[] = ["delete"];
  const fixed = new Set<ColKey>([...fixedStart, ...fixedEnd]);
  const middleDefault = DEFAULT_ORDER.filter((k) => !fixed.has(k));
  const out = (saved ?? []).filter(
    (k, i, all): k is ColKey => known.has(k) && all.indexOf(k) === i && !fixed.has(k as ColKey),
  );
  middleDefault.forEach((k, i) => {
    if (out.includes(k)) return;
    // After the nearest column before it by default that is already placed.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = out.indexOf(middleDefault[j]!);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    out.splice(at, 0, k);
  });
  return [...fixedStart, ...out, ...fixedEnd];
}

/** Move `from` to where `to` sits now. The fixed rails never move. */
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
export function visibleColumns(order: readonly ColKey[], multiPerson: boolean, kind: ComplianceKind): ColKey[] {
  return order.filter((k) => (multiPerson || !COLUMNS[k].teamOnly) && (!COLUMNS[k].only || COLUMNS[k].only === kind));
}

/* ── Sorting ─────────────────────────────────────────────────────────────── */

/** Outstanding first: not filled, then the WMS statuses up to Done, then Abandoned. */
const DOER_RANK: Record<DoerStatus, number> = {
  dont_know: 0,
  not_started: 1,
  need_info: 2,
  follow_up: 3,
  initiated: 4,
  done: 5,
  abandoned: 6,
};

function valueOf(r: ComplianceRow, key: ColKey): string | number | null {
  switch (key) {
    case "employee":
      return r.ownerName;
    case "compliance":
      return r.title;
    case "section":
      return r.section;
    case "frequency":
      // MCC shows the day it is due, so it sorts by that day: 2nd before 10th.
      return r.kind === "mcc" ? +r.deadline.slice(8, 10) : r.schedule;
    case "deadline":
      return r.deadline;
    case "mins":
      return r.minutes;
    case "doerStatus":
      return DOER_RANK[r.doerStatus ?? "dont_know"];
    case "qty":
      // Share of the target reached, so the shortest fall first; nothing
      // recorded (or nothing to count) sorts with the blanks.
      return r.quantity && r.completedQuantity !== null ? r.completedQuantity / r.quantity.target : null;
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
