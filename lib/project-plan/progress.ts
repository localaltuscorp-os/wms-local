/**
 * Project Plan — progress and partial milestone completion.
 *
 * Client-SAFE (no `server-only`, no db import) so the table can recompute as
 * rows are edited without a round-trip, and the server can compute the same
 * numbers for an export from the same code.
 *
 * PURE FUNCTIONS OVER REAL ROWS. Nothing here invents a number: every value
 * comes from the tree it is handed — a milestone's own recorded progress, or
 * the done/total of the executable rows beneath it. There is no default
 * "50%" anywhere, and a project with nothing under it reports 0 of 0 rather
 * than a flattering guess.
 *
 * THE PARTIAL RULE (brief §7). Milestone completion is a SUM OF FRACTIONS, not
 * a count of finished ones:
 *
 *   10 milestones, one of them half done   → 3.5 / 10
 *    8 milestones, one a quarter done      → 2.25 / 8
 *    4 milestones, one three-quarters done → 1.75 / 4
 *    7 milestones, one 40% done            → 4.4 / 7
 *
 * So `completed` is a DECIMAL and must never be rounded on the way through.
 * Rounding happens once, at the point of display, and only to a sensible number
 * of decimals — `formatCompletion` below is the only place allowed to do it.
 */

import type { PlanKind } from "./levels";

/** The shape this module needs from a row. Structural, so both the server's
 *  `PlanNode` and the client's `PlanRow` satisfy it without a conversion. */
export interface ProgressNode {
  kind: PlanKind;
  /** Manually recorded completion, 0–100. Null = "derive it from the work". */
  progressPercent?: number | null;
  /** The linked WMS task, on executable rows only. */
  task?: { status: string } | null;
  children: ProgressNode[];
}

/** A milestone/project rollup: a decimal count out of a whole. */
export interface Completion {
  /** Sum of per-milestone fractions — 3.5, 2.25, 4.4. NOT rounded. */
  completed: number;
  /** How many milestones there are. */
  total: number;
  /** completed / total as 0–1, or 0 when there is nothing to measure. */
  fraction: number;
}

/** Statuses that count as finished work. `done` is the only one: an approved
 *  or cancelled row is not progress, it is a verdict. */
const DONE_STATUSES: ReadonlySet<string> = new Set(["done"]);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * How complete ONE node is, as a fraction 0–1.
 *
 * The order of preference is deliberate:
 *
 *   1. An explicitly recorded `progressPercent` WINS. Someone looked at the
 *      milestone and said "this is 40% there"; a derived number must not
 *      silently overrule a human judgement.
 *   2. Otherwise, derive it from the executable rows beneath — done ÷ total.
 *      This is the number that keeps itself honest as tasks are ticked off.
 *   3. An executable row with no children is simply done or not done: 1 or 0.
 *   4. A container with neither recorded progress nor any executable work
 *      under it is 0. Not "unknown", not excluded — an empty milestone has
 *      genuinely delivered nothing.
 */
export function nodeFraction(node: ProgressNode): number {
  if (node.progressPercent != null && Number.isFinite(node.progressPercent)) {
    return clamp01(node.progressPercent / 100);
  }

  const leaves = executableLeaves(node);
  if (leaves.length > 0) {
    const done = leaves.filter((l) => l.task && DONE_STATUSES.has(l.task.status)).length;
    return clamp01(done / leaves.length);
  }

  // A bare executable row IS its own leaf — handled by executableLeaves, which
  // returns [node] for one. Reaching here means a container with no work.
  return 0;
}

/**
 * Every executable descendant (action / sub-action / sub-sub-action), including
 * the node itself when it is one. These are the rows that carry a real task, so
 * they are the only honest denominator for derived progress — counting
 * containers would let a milestone gain progress just by being subdivided.
 */
export function executableLeaves(node: ProgressNode): ProgressNode[] {
  const out: ProgressNode[] = [];
  const walk = (n: ProgressNode) => {
    const hasTaskLevel = n.kind === "action" || n.kind === "sub_action" || n.kind === "sub_sub_action";
    // A sub-divided action is measured by its children, not twice — the parent
    // is skipped as a leaf when it has executable children of its own.
    const executableChildren = n.children.filter(
      (c) => c.kind === "action" || c.kind === "sub_action" || c.kind === "sub_sub_action",
    );
    if (hasTaskLevel && executableChildren.length === 0) {
      out.push(n);
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

/**
 * How complete one node's DIRECT children of a given kind are — "3.5 / 10".
 *
 * Each child contributes its OWN fraction, so a half-finished one adds 0.5 and
 * the total lands on a decimal. Summed in one pass and never rounded here.
 *
 * This is the shape every level's rollup needs, which is why it is one function
 * rather than three near-copies: a project counts its milestones, a milestone
 * counts its results, a result counts its actions. Only the kind changes.
 */
export function childCompletion(parent: ProgressNode, kind: PlanKind): Completion {
  const children = parent.children.filter((c) => c.kind === kind);
  const total = children.length;
  if (total === 0) return { completed: 0, total: 0, fraction: 0 };

  let completed = 0;
  for (const c of children) completed += nodeFraction(c);

  return { completed, total, fraction: clamp01(completed / total) };
}

/**
 * A project's milestone completion — "3.5 / 10".
 *
 * Each milestone contributes its OWN fraction, so a half-finished milestone
 * adds 0.5 and the total lands on a decimal. Summed in one pass and never
 * rounded here.
 */
export function milestoneCompletion(project: ProgressNode): Completion {
  return childCompletion(project, "milestone");
}

/**
 * A milestone's RESULTS completion — the "3/10", "2.25/8" column on the
 * Milestones register. Same partial rule as milestones under a project: a
 * result recorded at 50% adds 0.5, so 10 results with one half-done reads
 * 3.5/10 and never 3/10 or 4/10.
 */
export function resultsCompletion(milestone: ProgressNode): Completion {
  return childCompletion(milestone, "result");
}

/**
 * A result's ACTIONS completion — the same column one level down, on the
 * Results register. An action has no recorded percent of its own, so each one
 * contributes 1 or 0 from its task status unless it has been sub-divided, in
 * which case its own sub-actions decide its fraction.
 */
export function actionsCompletion(result: ProgressNode): Completion {
  return childCompletion(result, "action");
}

/**
 * Overall project progress as a fraction 0–1.
 *
 * Defined as milestone completion, because that is what a project IS to the
 * people reading this screen: a set of milestones, each partly done. A project
 * with no milestones falls back to its own executable rows so a small project
 * run as a flat list of actions still reports something true rather than 0%.
 */
export function projectFraction(project: ProgressNode): number {
  const { total, fraction } = milestoneCompletion(project);
  if (total > 0) return fraction;
  return nodeFraction(project);
}

/** 0.4 → 40. Rounded to a whole percent for display ONLY. */
export function toPercent(fraction: number): number {
  return Math.round(clamp01(fraction) * 100);
}

/**
 * "3.5" — a partial count trimmed to at most 2 decimals with no trailing
 * zeros, so 3.5 stays 3.5, 2.25 stays 2.25, and 3 does not become "3.00".
 *
 * 2 decimals is not arbitrary: it is exactly what the brief's own examples
 * need (2.25, 1.75, 4.4), and cutting to 1 would round 2.25 to 2.3 — the
 * "do not round partial completion incorrectly" the brief warns about.
 */
export function formatCompleted(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/** "3.5/10" — the compact form for a cell. */
export function formatCompletion(c: Completion): string {
  return `${formatCompleted(c.completed)}/${c.total}`;
}

/** "40% | 3.5/10 | 3.5 out of 10 milestones are completed" — the long form. */
export function describeProgress(project: ProgressNode): {
  percent: number;
  completion: Completion;
  short: string;
  long: string;
} {
  const completion = milestoneCompletion(project);
  const percent = toPercent(projectFraction(project));
  const count = formatCompleted(completion.completed);
  return {
    percent,
    completion,
    short: `${percent}%`,
    long:
      completion.total === 0
        ? `${percent}% · no milestones yet`
        : `${percent}% | ${formatCompletion(completion)} | ${count} out of ${completion.total} milestones are completed`,
  };
}
