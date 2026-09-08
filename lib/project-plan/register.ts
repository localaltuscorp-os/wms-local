/**
 * Project Plan — the REGISTER row model, for every level of the plan.
 *
 * The flattening rule, lifted out of the table component so it can be tested
 * without rendering React. Client-SAFE for the same reason `levels.ts` and
 * `progress.ts` are: the register renders in the browser, and a server-side
 * export of the same table must be able to produce the identical rows from the
 * identical code.
 *
 * WHAT A "REGISTER" IS. Not a second query and not a denormalised copy — a
 * projection of the ONE tree `listPlanTree()` returns. Every row of one kind on
 * its own line, carrying the whole chain of parents above it. That is why the
 * relationships shown on screen cannot drift from the `parent_id`s in the
 * database: they are read off the tree on the way down, in the same pass that
 * numbers the rows.
 *
 * ONE WALK, FIVE LEVELS. Projects, Milestones, Results, Actions and Sub-Actions
 * differ only in how deep the walk goes, which ancestors it collects and what
 * the rollup column counts — so this is one recursive descent parameterised by
 * level rather than five near-copies drifting apart.
 *
 * REFERENCES ARE DERIVED, NEVER STORED. P1 / M2 / RA / A1 / SA1.2 come from
 * sibling position via the shared `refFor`, so a row is numbered identically
 * here, on the hierarchy board, in Project Views and on the kanban — and
 * deleting a sibling renumbers all of them at once. The long traceability path
 * (P3M3RD) rides along as `fullRef` for copying into an email; it is
 * deliberately not a column.
 */

import { refFor, fullRefFor, type PlanKind } from "./levels";
import { childCompletion, type Completion, type ProgressNode } from "./progress";

/** Every level that gets a register — the whole chain, top to bottom. */
export type RegisterLevel =
  | "projects"
  | "milestones"
  | "results"
  | "actions"
  | "sub-actions";

/** Which kind each register lists. */
export const LEVEL_KIND: Record<RegisterLevel, PlanKind> = {
  projects: "project",
  milestones: "milestone",
  results: "result",
  actions: "action",
  "sub-actions": "sub_action",
};

/**
 * The child kind whose completion fills the "…Completion" rollup column.
 *
 * Always one level down: a milestone is measured by its RESULTS (the brief's
 * 3.5/10), a result by its ACTIONS, an action by its SUB-ACTIONS. A lookup
 * rather than four hard-coded call sites.
 */
export const ROLLUP_KIND: Record<RegisterLevel, PlanKind> = {
  // A project is measured by its MILESTONES — the brief's "3/10 milestones
  // are completed" column.
  projects: "milestone",
  milestones: "result",
  results: "action",
  actions: "sub_action",
  "sub-actions": "sub_sub_action",
};

/**
 * The ancestor columns each register shows, outermost first.
 *
 * Derived from the chain rather than listed by hand, so a register always shows
 * exactly the parents that exist above its level — the Actions register carries
 * Project, Milestone and Result; the Sub-Actions one adds Action.
 */
export const ANCESTOR_KINDS: Record<RegisterLevel, PlanKind[]> = {
  // A project is the top of the chain: it has no parent to show, so its
  // register opens straight on Project No / Project Name.
  projects: [],
  milestones: ["project"],
  results: ["project", "milestone"],
  actions: ["project", "milestone", "result"],
  "sub-actions": ["project", "milestone", "result", "action"],
};

/** The descent a register walks, top-down. */
const CHAIN: PlanKind[] = ["project", "milestone", "result", "action", "sub_action"];

/**
 * The minimum a node must have to be flattened into a register row.
 *
 * Structural and generic so the client's full `PlanRow` passes straight
 * through with its own type intact — the register needs an id, a name and a
 * kind, plus whatever `progress.ts` needs to compute the rollup. It does not
 * need to know about doers, tasks or dates, so it does not ask for them.
 */
export interface RegisterNode extends ProgressNode {
  id: string;
  name: string;
  kind: PlanKind;
  children: RegisterNode[];
}

/** One parent above a register row — "Milestone M2 ATTENDANCE". */
export interface RegisterAncestor {
  kind: PlanKind;
  /** M2 — position among ITS siblings. */
  ref: string;
  name: string;
  /** The real row, so a cell can link to it by id rather than by label. */
  id: string;
}

/** One flattened row: the node plus every ancestor the table shows. */
export interface RegisterRow<T extends RegisterNode = RegisterNode> {
  node: T;
  /** Project → … → immediate parent, in that order. EMPTY on the Projects
   *  register, where the row is itself the top of the chain. */
  ancestors: RegisterAncestor[];
  /** This row's own short ref — M2, RA, A1, SA1.2. */
  ownRef: string;
  /** P3M3RD — traceability only, never a column. */
  fullRef: string;
  /** Direct children of the rollup kind, as a decimal count. */
  rollup: Completion;
}

/**
 * Walk the tree once and emit the rows for this level, deriving every ref from
 * sibling position on the way down.
 *
 * ONE PASS, top-down, because a row's ref depends on its parent's. Numbering
 * restarts within each parent — the first milestone of P2 is M1, not M4 — which
 * is what makes "P2 · M1" a reference a person can actually use.
 *
 * Rows whose parent chain is the wrong shape are skipped rather than guessed
 * at: a `result` sitting directly under a project has no milestone to name, and
 * inventing one would put a false relationship on screen. The walk only ever
 * descends through the exact chain, so such a row is simply never reached.
 */
export function buildRegisterRows<T extends RegisterNode>(
  tree: T[],
  level: RegisterLevel,
): RegisterRow<T>[] {
  const wantDepth = CHAIN.indexOf(LEVEL_KIND[level]);
  const rollupKind = ROLLUP_KIND[level];
  const out: RegisterRow<T>[] = [];

  const walk = (
    nodes: T[],
    depth: number,
    ancestors: RegisterAncestor[],
    parentRef: string | null,
    parentFullRef: string | null,
  ): void => {
    const kind = CHAIN[depth];
    if (!kind) return;

    // Siblings of this kind only, so position — and therefore the ref — counts
    // the same rows the hierarchy board counts.
    const siblings = nodes.filter((n) => n.kind === kind);

    siblings.forEach((node, i) => {
      const ref = refFor(kind, i + 1, parentRef);
      const fullRef = fullRefFor(kind, i + 1, parentFullRef);

      if (depth === wantDepth) {
        out.push({
          node,
          ancestors,
          ownRef: ref,
          fullRef,
          rollup: childCompletion(node, rollupKind),
        });
        return;
      }

      walk(
        node.children as T[],
        depth + 1,
        [...ancestors, { kind, ref, name: node.name, id: node.id }],
        ref,
        fullRef,
      );
    });
  };

  walk(tree, 0, [], null, null);
  return out;
}

/** The ancestor of a given kind on a row, or null when it has none. */
export function ancestorOf(
  row: RegisterRow<RegisterNode>,
  kind: PlanKind,
): RegisterAncestor | null {
  return row.ancestors.find((a) => a.kind === kind) ?? null;
}
