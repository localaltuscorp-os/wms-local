/**
 * Project Views — resolving a drill-down path against the real hierarchy.
 *
 * Client-SAFE (no `server-only`, no db import), like `levels.ts`, `progress.ts`
 * and `register.ts`: the screen resolves the path in the browser as the user
 * clicks, and the same code can resolve it on the server for a link someone
 * pasted into chat. One copy of the rule.
 *
 * THE PATH IS IDS, NOT LABELS. A selection is four uuids — project, milestone,
 * result, action — and each one is resolved by looking it up among the CHILDREN
 * of the level above (i.e. through `parent_id`). The short refs P1 / M1 / RA are
 * computed on the way down for display only; nothing is ever found by matching
 * one. That is what brief §8 asks for, and it is also what makes the refs safe
 * to renumber: deleting M1 changes every label below it and breaks no link.
 *
 * A STALE ID IS DROPPED, NOT GUESSED. If the URL names a milestone that is not
 * under the named project — an old bookmark, a row deleted, a branch moved —
 * the path truncates at the last level that genuinely lines up rather than
 * showing rows from somewhere else under a breadcrumb that lies. Everything
 * deeper is dropped with it, because it hung off the part that no longer holds.
 */

import { refFor, fullRefFor, KIND_LABEL, type PlanKind } from "./levels";

/** The minimum a node needs to take part in a drill-down. Structural, so the
 *  client's full `PlanRow` passes through with its own type intact. */
export interface ViewNode {
  id: string;
  name: string;
  kind: PlanKind;
  children: ViewNode[];
}

/** The four ids that describe where the user is. Any of them may be null. */
export interface ViewSelection {
  projectId: string | null;
  milestoneId: string | null;
  resultId: string | null;
  actionId: string | null;
}

/** One row offered at a level, with the ref it displays under. */
export interface ViewRow<T extends ViewNode = ViewNode> {
  node: T;
  /** M2 — position among its siblings of the same kind. */
  ref: string;
  /** P1M2 — the traceability path, for titles and copy-paste. */
  fullRef: string;
}

/** One open pane: every row of one kind under the level above. */
export interface ViewLevel<T extends ViewNode = ViewNode> {
  kind: PlanKind;
  /** "Milestones" — the pane's heading. */
  label: string;
  /** The parent whose children these are. Null only for the project level. */
  parentId: string | null;
  rows: ViewRow<T>[];
  /** Which row is drilled into, or null when the pane is a leaf listing. */
  selectedId: string | null;
}

/** A breadcrumb hop — "Milestone: M1 Attendance". */
export interface ViewCrumb<T extends ViewNode = ViewNode> {
  node: T;
  kind: PlanKind;
  /** "Milestone" */
  kindLabel: string;
  ref: string;
  fullRef: string;
  /** The selection that returns to this hop — everything below is cleared. */
  selection: ViewSelection;
}

/** The whole resolved screen. */
export interface ViewPath<T extends ViewNode = ViewNode> {
  /** The panes to draw, outermost first. Empty until a project is chosen. */
  levels: ViewLevel<T>[];
  crumbs: ViewCrumb<T>[];
  /** The selection actually in force, with stale ids dropped. Compare against
   *  what came in to decide whether the URL needs rewriting. */
  selection: ViewSelection;
  /** The deepest node the path reaches, or null when only a project is picked.
   *  This is the row whose details the side panel shows. */
  focus: T | null;
}

export const EMPTY_SELECTION: ViewSelection = {
  projectId: null,
  milestoneId: null,
  resultId: null,
  actionId: null,
};

/** The kinds a drill-down walks through, in order. */
const CHAIN: PlanKind[] = ["project", "milestone", "result", "action", "sub_action"];

/** Which selection field holds the id for each kind along the chain. */
const FIELD: Record<string, keyof ViewSelection> = {
  project: "projectId",
  milestone: "milestoneId",
  result: "resultId",
  action: "actionId",
};

/**
 * Children of one node of a given kind, in tree order, each with its ref.
 *
 * The ref is position-based and computed HERE rather than stored, so it always
 * matches what the hierarchy board and the registers show for the same row.
 */
function rowsOf<T extends ViewNode>(
  siblings: T[],
  kind: PlanKind,
  parentRef: string | null,
  parentFullRef: string | null,
): ViewRow<T>[] {
  return siblings
    .filter((c) => c.kind === kind)
    .map((node, i) => ({
      node,
      ref: refFor(kind, i + 1, parentRef),
      fullRef: fullRefFor(kind, i + 1, parentFullRef),
    }));
}

/**
 * Resolve a selection against the tree.
 *
 * Walks the chain top-down. At each step it lists the children of the kind that
 * belongs there, then looks for the selected id AMONG THOSE CHILDREN. A miss
 * ends the walk: the pane still renders (so the user sees the options), but
 * nothing deeper is opened and the stale ids are stripped from `selection`.
 */
export function resolveViewPath<T extends ViewNode>(
  tree: T[],
  input: Partial<ViewSelection>,
): ViewPath<T> {
  const wanted: ViewSelection = { ...EMPTY_SELECTION, ...input };
  const levels: ViewLevel<T>[] = [];
  const crumbs: ViewCrumb<T>[] = [];
  const selection: ViewSelection = { ...EMPTY_SELECTION };

  // The project level is the tree's own top row-set; every level after it is
  // the children of whatever the previous level selected.
  let siblings: T[] = tree;
  let parentId: string | null = null;
  let parentRef: string | null = null;
  let parentFullRef: string | null = null;
  let focus: T | null = null;

  for (let depth = 0; depth < CHAIN.length; depth++) {
    const kind = CHAIN[depth]!;
    // Annotated rather than inferred: `siblings` is reassigned from a row found
    // in `rows`, so leaving these to inference makes rows → hit → siblings →
    // rows a cycle TS cannot resolve (TS7022).
    const rows: ViewRow<T>[] = rowsOf(siblings, kind, parentRef, parentFullRef);

    // The project pane is a dropdown, not a listing pane — the screen renders
    // it itself. Every other level is a pane the user clicks through.
    if (depth > 0) {
      levels.push({
        kind,
        label: `${KIND_LABEL[kind]}s`,
        parentId,
        rows,
        selectedId: null,
      });
    }

    // sub_action is the last kind in the chain: there is nothing to select
    // INTO from it, so the walk ends once its pane has been listed.
    const field = FIELD[kind];
    if (!field) break;

    const wantId = wanted[field];
    if (!wantId) break;

    // The lookup that makes this a real relationship: the id must be one of
    // THESE children, not merely a node that exists somewhere in the plan.
    const hit: ViewRow<T> | undefined = rows.find((r) => r.node.id === wantId);
    if (!hit) break;

    selection[field] = hit.node.id;
    focus = hit.node;
    if (depth > 0) levels[levels.length - 1]!.selectedId = hit.node.id;

    crumbs.push({
      node: hit.node,
      kind,
      kindLabel: KIND_LABEL[kind],
      ref: hit.ref,
      fullRef: hit.fullRef,
      // Clicking a crumb returns to that hop, which means dropping everything
      // chosen below it — built by keeping only the fields up to this depth.
      selection: truncate(selection, depth),
    });

    siblings = hit.node.children as T[];
    parentId = hit.node.id;
    parentRef = hit.ref;
    parentFullRef = hit.fullRef;
  }

  return { levels, crumbs, selection, focus };
}

/** A copy of `sel` keeping only the ids down to `depth` in the chain. */
function truncate(sel: ViewSelection, depth: number): ViewSelection {
  const out: ViewSelection = { ...EMPTY_SELECTION };
  for (let i = 0; i <= depth; i++) {
    const field = FIELD[CHAIN[i]!];
    if (field) out[field] = sel[field];
  }
  return out;
}

/**
 * The selection produced by clicking `node` at `kind` while at `current`.
 *
 * Selecting at one level always CLEARS the levels below, because they described
 * a branch the user has just navigated away from. Re-selecting the row that is
 * already open collapses it — the second click on a milestone closes its
 * results rather than doing nothing, which is what people expect of a
 * drill-down and costs one comparison to support.
 */
export function selectAt(
  current: ViewSelection,
  kind: PlanKind,
  nodeId: string,
): ViewSelection {
  const depth = CHAIN.indexOf(kind);
  const field = FIELD[kind];
  if (depth < 0 || !field) return current;

  if (current[field] === nodeId) {
    // Collapse: keep everything ABOVE this level, drop this one and below.
    return truncate(current, depth - 1);
  }

  const out = truncate(current, depth - 1);
  out[field] = nodeId;
  return out;
}

/**
 * Which URL query the selection serialises to.
 *
 * Short keys, and an absent level is an ABSENT key rather than an empty string,
 * so a link to a project is `?project=…` and not `?project=…&m=&r=&a=`.
 */
export function selectionToQuery(sel: ViewSelection): Record<string, string> {
  const q: Record<string, string> = {};
  if (sel.projectId) q.project = sel.projectId;
  if (sel.milestoneId) q.m = sel.milestoneId;
  if (sel.resultId) q.r = sel.resultId;
  if (sel.actionId) q.a = sel.actionId;
  return q;
}

/** The inverse — read a selection out of URL params. */
export function selectionFromQuery(get: (key: string) => string | null): ViewSelection {
  return {
    projectId: get("project"),
    milestoneId: get("m"),
    resultId: get("r"),
    actionId: get("a"),
  };
}

/**
 * WHICH SCHEDULING FIELDS A LEVEL MAY SHOW.
 *
 * Brief §5 is explicit: a Result gets the task-ish controls EXCEPT Start Time,
 * End Time and an hours duration. The rule lives here rather than as an `if`
 * inside the table so the pane and any future export cannot disagree about it,
 * and so the exclusion is one line to audit.
 *
 * The deeper reason it is safe to withhold them: a Result is a CONTAINER — it
 * carries no linked WMS task (only action / sub_action / sub_sub_action do), so
 * a clock time on it would be plan metadata that no calendar, timer or WMS list
 * would ever honour. A Result is scheduled by the date it is due and measured
 * by the actions underneath it.
 */
export interface LevelFieldRules {
  /** Start Time / End Time columns and editors. */
  clockTimes: boolean;
  /** An hours/minutes duration figure. */
  hoursDuration: boolean;
  /** Target date — every level keeps this. */
  targetDate: boolean;
  /** Opens the full WMS task record (repeat, timer, approvals, checklist). */
  wmsTask: boolean;
}

export const LEVEL_FIELDS: Record<PlanKind, LevelFieldRules> = {
  project:        { clockTimes: false, hoursDuration: false, targetDate: true, wmsTask: false },
  milestone:      { clockTimes: false, hoursDuration: false, targetDate: true, wmsTask: false },
  // The three exclusions of brief §5, in the one place that decides them.
  result:         { clockTimes: false, hoursDuration: false, targetDate: true, wmsTask: false },
  // Executable rows ARE WMS tasks, so they get the whole WMS record.
  action:         { clockTimes: true,  hoursDuration: true,  targetDate: true, wmsTask: true },
  sub_action:     { clockTimes: true,  hoursDuration: true,  targetDate: true, wmsTask: true },
  sub_sub_action: { clockTimes: true,  hoursDuration: true,  targetDate: true, wmsTask: true },
};

/* ───────────────────────────────────────────────── The hierarchy listing ─ */
//
// The drill-down above answers "what is under the row I clicked?". The tree
// below answers "show me the whole shape at once" — one indented list from
// Project down to Sub-Action, expanded and collapsed in place.
//
// It shares the refs, the parent_id walk and the stale-id handling with the
// drill-down deliberately: two ways of LOOKING at `listPlanTree()`, not two
// models of it. Nothing here reads the database, and nothing here is stored —
// which row is open is a set of ids held by the screen.

/** One visible line of the hierarchy, already indented and already numbered. */
export interface TreeRow<T extends ViewNode = ViewNode> {
  node: T;
  kind: PlanKind;
  /** 0 for a project, 1 for a milestone … — the row's indent step. */
  depth: number;
  /** M2 — position among its siblings of the same kind. */
  ref: string;
  /** P1M2 — the traceability path, for titles and copy-paste. */
  fullRef: string;
  /** Ancestor ids, outermost first. What "expand to here" has to open. */
  ancestorIds: string[];
  /** Direct children, whether or not they are currently shown. */
  childCount: number;
  /** Open right now — the chevron's state. False on a childless row. */
  expanded: boolean;
  /** Last of its siblings, so the tree guide can stop at the elbow. */
  isLast: boolean;
}

/**
 * The tree as a flat list of the lines currently visible.
 *
 * Flat rather than nested on purpose: the screen needs one `<li>` per line with
 * a depth to indent by, and a flat list keeps the row component free of
 * recursion — every line is rendered by the same code whether it is a project
 * or a sub-sub-action.
 *
 * A node is walked into only when its id is in `expanded`, so a plan with a
 * thousand rows costs whatever is open and no more.
 */
export function flattenPlanTree<T extends ViewNode>(
  tree: T[],
  expanded: ReadonlySet<string>,
  opts?: {
    /** Show only this project's branch. Null / unknown id = every project. */
    rootId?: string | null;
    /** Keep only rows matching this — plus every ancestor that leads to one,
     *  because a match hanging off nothing is unreachable. Case-insensitive. */
    query?: string;
  },
): TreeRow<T>[] {
  const roots = opts?.rootId
    ? tree.filter((n) => n.id === opts.rootId)
    : tree.slice();

  const needle = (opts?.query ?? "").trim().toLowerCase();
  const keep = needle ? matchingIds(roots, needle) : null;

  const out: TreeRow<T>[] = [];

  const walk = (
    siblings: T[],
    depth: number,
    parentRef: string | null,
    parentFullRef: string | null,
    ancestorIds: string[],
  ): void => {
    // Counted per kind rather than per position: a stray row of another kind
    // among the siblings must not push M2 to M3.
    const seen = new Map<PlanKind, number>();
    const shown = keep ? siblings.filter((c) => keep.has(c.id)) : siblings;

    shown.forEach((node, i) => {
      const index1 = (seen.get(node.kind) ?? 0) + 1;
      seen.set(node.kind, index1);

      const ref = refFor(node.kind, index1, parentRef);
      const fullRef = fullRefFor(node.kind, index1, parentFullRef);
      const children = node.children as T[];
      // A search opens the branches it matched through; without one the user's
      // own expansion decides. Either way a childless row is never "open".
      const isOpen =
        children.length > 0 && (keep ? true : expanded.has(node.id));

      out.push({
        node,
        kind: node.kind,
        depth,
        ref,
        fullRef,
        ancestorIds,
        childCount: children.length,
        expanded: isOpen,
        isLast: i === shown.length - 1,
      });

      if (isOpen) {
        walk(children, depth + 1, ref, fullRef, [...ancestorIds, node.id]);
      }
    });
  };

  walk(roots, 0, null, null, []);
  return out;
}

/** Ids of every row that matches, plus every ancestor on the way to one. */
function matchingIds(roots: ViewNode[], needle: string): Set<string> {
  const keep = new Set<string>();

  const visit = (node: ViewNode): boolean => {
    let hit = node.name.toLowerCase().includes(needle);
    for (const child of node.children) {
      // Not short-circuited: every matching branch has to be kept, not just
      // the first one found.
      if (visit(child)) hit = true;
    }
    if (hit) keep.add(node.id);
    return hit;
  };

  roots.forEach(visit);
  return keep;
}

/** Every id that has children — what "Expand all" opens. */
export function expandableIds(tree: ViewNode[]): string[] {
  const out: string[] = [];
  const walk = (siblings: ViewNode[]): void => {
    for (const node of siblings) {
      if (node.children.length > 0) {
        out.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(tree);
  return out;
}

/**
 * The expansion a saved selection implies: every level the URL named, so a
 * pasted `?project=…&m=…&r=…` link opens straight onto that row.
 *
 * Takes the selection RESOLVED by `resolveViewPath`, not the raw query, so a
 * stale id opens nothing rather than opening a branch it no longer belongs to.
 */
export function expansionForSelection(sel: ViewSelection): Set<string> {
  const ids = [sel.projectId, sel.milestoneId, sel.resultId, sel.actionId];
  return new Set(ids.filter((id): id is string => Boolean(id)));
}
