/**
 * Project Plan — the LAST-ACCESSED BRANCH.
 *
 * "Bulk upload goes inside the project which was last opened — same with
 * results and actions and sub-actions." That sentence is this file: one
 * remembered path down the tree, written whenever someone touches a row, read
 * whenever a create surface needs to guess where a new row belongs.
 *
 * WHAT IS STORED IS A CHAIN, NOT SIX INDEPENDENT IDS. A remembered milestone
 * that no longer sits under the remembered project is worse than no memory at
 * all — it would file work in the wrong place and look deliberate doing it. So
 * a write always carries the whole path from the project down to the row that
 * was touched, and a read always re-derives that path from the live tree
 * (`resolveRecentPlan`) rather than trusting what was written. Names come back
 * fresh, deleted rows fall out, and the only thing storage really has to keep
 * is "which row was I last looking at".
 *
 * PER BROWSER, NOT PER ACCOUNT. This is a convenience about where you were a
 * moment ago, not a preference worth a column and a round-trip. localStorage is
 * the right size for it, and a cleared one costs a dropdown click.
 *
 * Client-SAFE (no `server-only`, no db): the board, the register and the two
 * create dialogs all read it in the browser, and the tests import it directly.
 */

import { PARENT_KIND, isPlanKind, type PlanKind } from "./levels";

/** One remembered row — the two things a picker needs to show it. */
export interface RecentPlanNode {
  id: string;
  name: string;
}

/** The remembered path, keyed by level: `{ project: …, milestone: … }`. */
export type RecentPlanContext = Partial<Record<PlanKind, RecentPlanNode>>;

/** One link of a remembered path, as it goes into storage. */
export interface RecentPlanLink extends RecentPlanNode {
  kind: PlanKind;
}

/**
 * The shape this module needs off a tree node. Structural on purpose: the real
 * `PlanRow` lives in a client component with a task, a status and twenty other
 * fields, and none of them are any of this file's business.
 */
export interface PlanTreeLike {
  id: string;
  name: string;
  kind: PlanKind;
  children: PlanTreeLike[];
}

const KEY = "wms.project-plan.recent.v1";

/** Fired on the window after every write, so two surfaces on one screen agree. */
export const RECENT_PLAN_EVENT = "wms:project-plan-recent";

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * The raw remembered path, deepest link last. Not usable on its own — run it
 * through `resolveRecentPlan` against the live tree first.
 */
export function readRecentChain(): RecentPlanLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const chain = (parsed as { chain?: unknown })?.chain;
    if (!Array.isArray(chain)) return [];
    return chain.flatMap((link) => {
      const l = link as Partial<RecentPlanLink>;
      return typeof l?.id === "string" && isPlanKind(l.kind)
        ? [{ id: l.id, kind: l.kind, name: typeof l.name === "string" ? l.name : "" }]
        : [];
    });
  } catch {
    // A private window, a full quota, a hand-edited value — none of which is a
    // reason to break the screen that asked where you were.
    return [];
  }
}

/**
 * Remember a path. Levels BELOW the deepest link are dropped rather than kept:
 * opening a different milestone makes the action you had open under the old one
 * a stale answer to "which action was I last in?", not a still-valid one.
 */
export function writeRecentChain(chain: RecentPlanLink[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, chain, at: Date.now() }));
  } catch {
    /* quota or a blocked store — the memory is a nicety, never a blocker */
  }
  window.dispatchEvent(new CustomEvent(RECENT_PLAN_EVENT));
}

// ── Deriving a path from the tree ────────────────────────────────────────────

/**
 * The path from the root down to `id`, INCLUSIVE — `[project, milestone, …]` —
 * or an empty array when the id is not in this tree.
 *
 * The single source of every remembered chain: nothing else in the module
 * assembles one by hand, so a remembered path is a path that really exists.
 */
export function planPathTo(tree: PlanTreeLike[], id: string): RecentPlanLink[] {
  const stack: RecentPlanLink[] = [];
  const walk = (nodes: PlanTreeLike[]): boolean => {
    for (const n of nodes) {
      stack.push({ id: n.id, name: n.name, kind: n.kind });
      if (n.id === id) return true;
      if (walk(n.children)) return true;
      stack.pop();
    }
    return false;
  };
  return walk(tree) ? [...stack] : [];
}

/**
 * The stored chain, checked against the live tree.
 *
 * Walks the remembered path from its DEEPEST link upwards and returns the path
 * of the first id that still exists — so deleting a sub-action falls back to
 * its action, and deleting the whole project falls back to nothing rather than
 * to a context full of ids that resolve to no row.
 */
export function resolveRecentPlan(
  tree: PlanTreeLike[],
  chain: RecentPlanLink[],
): RecentPlanContext {
  for (let i = chain.length - 1; i >= 0; i--) {
    const path = planPathTo(tree, chain[i]!.id);
    if (path.length > 0) return contextFrom(path);
  }
  return {};
}

/** `[project, milestone]` → `{ project: …, milestone: … }`. */
export function contextFrom(chain: RecentPlanLink[]): RecentPlanContext {
  const out: RecentPlanContext = {};
  for (const link of chain) out[link.kind] = { id: link.id, name: link.name };
  return out;
}

// ── What a create surface actually asks ─────────────────────────────────────

/**
 * The ancestor ids to pre-fill when creating a row of `kind`, as the create
 * dialog's `picked` map: every level from the project down to this row's
 * parent, and nothing below it.
 *
 * Stops at the first level the context cannot supply. A chain with a hole in it
 * is not a chain — the dialog's own pickers cascade, so a milestone id with no
 * project above it would sit in a select whose options were never loaded.
 */
export function seedAncestors(kind: PlanKind, ctx: RecentPlanContext): Partial<Record<PlanKind, string>> {
  const out: Partial<Record<PlanKind, string>> = {};
  // Outermost first, so the walk can stop the moment a level is missing.
  for (const level of ancestorLevels(kind)) {
    const hit = ctx[level];
    if (!hit) break;
    out[level] = hit.id;
  }
  return out;
}

/** The levels a row of `kind` sits under, outermost first. */
export function ancestorLevels(kind: PlanKind): PlanKind[] {
  const out: PlanKind[] = [];
  let p = PARENT_KIND[kind];
  while (p) {
    out.unshift(p);
    p = PARENT_KIND[p];
  }
  return out;
}

/**
 * The row a new `kind` would hang off, if the remembered path reaches that far
 * — the "into" line every bulk upload opens with. Null for a project, and for
 * any level whose parent has not been visited.
 */
export function defaultParentFor(kind: PlanKind, ctx: RecentPlanContext): RecentPlanNode | null {
  const parentLevel = PARENT_KIND[kind];
  if (!parentLevel) return null;
  // The whole chain above the parent has to be intact, or "into X" is a claim
  // the pickers below it cannot back up.
  const seeded = seedAncestors(kind, ctx);
  return seeded[parentLevel] ? ctx[parentLevel] ?? null : null;
}
