/**
 * THE CREATOR WORKLOAD BOARD — "who is creating how much work".
 *
 * The inverse question to the delegation board beside it. That one counts what
 * each person RECEIVED and asks who put it there; this one counts what each
 * person ORIGINATED and asks who they put it on. Same three families, same
 * window, same pro-rated targets — read together they close the loop.
 *
 * Free of `server-only` and of any database import, for the reason spelled out
 * at the top of manager-activity-contract.ts: the client table imports VALUES
 * from here (the relation list, the target maths), and a value import from a
 * server-only module is a real edge in the browser graph that fails the build.
 * The query module re-exports everything, so there is still one definition.
 */

import type { ActivityTargets, ActivityPeriod } from "./manager-activity-contract";

/* ── The five delegation relationships ─────────────────────────────────────
   Every item one person creates lands on exactly one other person, and the
   RELATIONSHIP between the two is what this board splits on. The five
   partition the space — an item is credited to exactly one — so a row's total
   is a real total rather than a sum of overlapping cuts.

   Order is deliberate and is also the classification precedence: an item for
   yourself is Self even if you are your own manager's report; work sent to the
   Founder is Founder even though the Founder is also up the chain. */

export const WORKLOAD_RELATIONS = [
  {
    key: "self",
    label: "Self",
    hint: "Self-assigned work",
    /** How the relation reads inside a sentence: "28 WMS Tasks created for
     *  Downward reports". Stated per relation rather than assembled from the
     *  label at the call site, which is how a tooltip ends up saying
     *  "created for Founder reports". */
    phrase: "Self",
    /** Self and Downward are the two the business sets a quota for. */
    targeted: true,
  },
  {
    key: "downward",
    label: "Downward",
    hint: "Delegated to direct reports",
    phrase: "Downward reports",
    targeted: true,
  },
  {
    key: "counterpart",
    label: "Counterpart",
    hint: "Peer / cross-departmental",
    phrase: "Counterpart peers",
    targeted: false,
  },
  {
    key: "upward",
    label: "Upward",
    hint: "Delegated to a manager / superior",
    phrase: "a manager, upward",
    targeted: false,
  },
  {
    key: "founder",
    label: "Founder",
    hint: "Delegated to the Founder",
    phrase: "the Founder",
    targeted: false,
  },
] as const;

export type WorkloadRelation = (typeof WORKLOAD_RELATIONS)[number]["key"];

/** One family's counts for one creator, split five ways. */
export interface RelationSplit {
  self: number;
  downward: number;
  counterpart: number;
  upward: number;
  founder: number;
  /** The five, added. Every item lands in exactly one bucket. */
  total: number;
}

export const emptyRelationSplit = (): RelationSplit => ({
  self: 0,
  downward: 0,
  counterpart: 0,
  upward: 0,
  founder: 0,
  total: 0,
});

/* ── The three families ────────────────────────────────────────────────────
   `noun` is what a tooltip calls them in a sentence — "28 WMS Tasks created
   for Downward reports" — so the label and the prose never drift apart.
   `totalLabel` names the third sub-column outright: it replaced "G.T.", which
   said nothing about WHAT was being totalled and left the reader to infer it
   from a super-header two rows up. */

export const WORKLOAD_FAMILIES = [
  { key: "goals", label: "WMS Goals", noun: "Weekly Goals", totalLabel: "Total Goals" },
  { key: "tasks", label: "WMS Tasks", noun: "WMS Tasks", totalLabel: "Total Tasks" },
  {
    key: "commitments",
    label: "Daily Commitments",
    noun: "Daily Commitments",
    totalLabel: "Total Commitments",
  },
] as const;

export type WorkloadFamily = (typeof WORKLOAD_FAMILIES)[number]["key"];

/** ONE FLAT ROW. No manager grouping, no direct-report nesting: every employee
 *  is a peer of every other on this board, which is the point of it. */
export interface CreatorWorkloadRow {
  employeeId: string;
  employeeName: string;
  /** Not a grouping key — it SCALES the Downward target, which is quoted "per
   *  person". Someone with no reports has no downward quota to miss. */
  directReports: number;
  goals: RelationSplit;
  tasks: RelationSplit;
  commitments: RelationSplit;
  /** goals.total + tasks.total + commitments.total. */
  grandTotal: number;
}

export interface CreatorWorkloadBoard {
  period: ActivityPeriod;
  /** Pro-rated to the window, so 3 days and a year do not share a quota. */
  targets: ActivityTargets;
  /** Inclusive IST date bounds, YYYY-MM-DD. */
  from: string;
  to: string;
  rows: CreatorWorkloadRow[];
}

/**
 * A PERSON'S OWN QUOTA, at the rate it is quoted in — not scaled to the window.
 *
 * Three goals a week, five tasks a day, five commitments a day. These are the
 * numbers the business states, and they are what an individual's Self Created
 * cell is measured against.
 *
 * Deliberately NOT `targets[family]`, which multiplies the rate out across the
 * whole window. A member row was reading `0 / 30` over a six-working-day
 * window — a denominator nobody is asked to hit in one sitting, and one that
 * changed every time the window did, so the same person's quota appeared to
 * move when all that moved was the filter.
 */
export const SELF_TARGETS = { goals: 3, tasks: 5, commitments: 5 } as const;

/**
 * The target behind one (family, relation) cell, or null when the category
 * carries no quota.
 *
 * SELF is the flat per-person rate above — fixed, window-independent.
 *
 * DOWNWARD is quoted per report and DOES scale with the window: a manager's
 * obligation to push work down is a function of how many people are waiting
 * and how many days they had, so it is `rate x working days x reports`, which
 * is exactly `targets[family] * directReports`. A creator with no reports gets
 * null rather than 0 — `0 / 0` reads as a failed quota where there is simply
 * no quota to have.
 *
 * COUNTERPART, UPWARD and FOUNDER are raw counts by design. They measure where
 * work flows, not whether someone hit a number, and putting a denominator under
 * them would invent a quota the business has not set.
 *
 * ONE CONSEQUENCE, stated rather than left to be discovered: a Self cell counts
 * the WHOLE window against a ONE-DAY denominator, so over anything longer than
 * a day it reads well past target. That is what a fixed per-day quota means
 * here; if the Self cell should instead be read as a daily average, it is this
 * function that changes, not four call sites.
 */
export function cellTarget(
  targets: ActivityTargets,
  family: WorkloadFamily,
  relation: WorkloadRelation,
  directReports: number,
): number | null {
  if (relation === "self") return SELF_TARGETS[family];
  if (relation !== "downward") return null;
  return directReports > 0 ? targets[family] * directReports : null;
}

/**
 * THE DENOMINATOR UNDER A *TOTAL* CELL — one family's whole quota for this
 * window, per person.
 *
 * These cells carried no denominator at all, on the stated grounds that Self
 * and Delegated Out are two quotas against two different denominators and
 * adding them compares a sum to neither. That objection is correct and this
 * does not do it: the total is measured against `targets[family]` on its own —
 * the business's rate for that family, pro-rated to the window — not against
 * `SELF_TARGETS + downward x reports`. Summing those two would add a per-DAY
 * figure to a per-WINDOW one, and over a month the per-day half rounds to
 * noise.
 *
 * So a total cell reads "what you produced against what the window asks for",
 * which is a single coherent number and the only one in the payload that is.
 */
export function totalTarget(targets: ActivityTargets, family: WorkloadFamily): number {
  return targets[family];
}

/** The same, summed across all three families, for a Grand Total column. */
export function grandTotalTarget(targets: ActivityTargets): number {
  return targets.goals + targets.tasks + targets.commitments;
}

/** Read one family's split off a row without a switch at every call site. */
export function splitOf(row: CreatorWorkloadRow, family: WorkloadFamily): RelationSplit {
  return family === "goals" ? row.goals : family === "tasks" ? row.tasks : row.commitments;
}

/* ── Sorting ───────────────────────────────────────────────────────────────
   Every column sorts both ways. The key names the column; the direction is
   held beside it so clicking the active column flips it rather than restarting
   at ascending. `<family>Count` matches the key the nested delegation board
   uses for the same number, so the two sections speak one vocabulary. */

export type WorkloadSortKey = "name" | `${WorkloadFamily}Count` | "grandTotal";
export type SortDir = "asc" | "desc";

export function sortWorkloadRows(
  rows: CreatorWorkloadRow[],
  key: WorkloadSortKey,
  dir: SortDir | null,
): CreatorWorkloadRow[] {
  // A null direction means no sort is applied — the rows keep the order the
  // server sent them in, which is alphabetical.
  if (!dir) return rows;
  const flip = dir === "asc" ? 1 : -1;
  const value = (r: CreatorWorkloadRow) =>
    key === "grandTotal"
      ? r.grandTotal
      : splitOf(r, key.slice(0, -"Count".length) as WorkloadFamily).total;
  // Copy first: the caller's array is memoised state, and sorting in place
  // would mutate it without changing its identity — React would keep the old
  // render and the click would look like it did nothing.
  return [...rows].sort((a, b) => {
    if (key === "name") return flip * a.employeeName.localeCompare(b.employeeName);
    const d = value(a) - value(b);
    // Ties fall back to the name so the order is stable and reproducible
    // rather than dependent on the order the rows arrived in.
    return d !== 0 ? flip * d : a.employeeName.localeCompare(b.employeeName);
  });
}
