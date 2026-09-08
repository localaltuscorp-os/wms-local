"use client";

import * as React from "react";
import { KIND_LABEL, PARENT_KIND, type PlanKind } from "@/lib/project-plan/levels";
import { ancestorLevels } from "@/lib/project-plan/recent";
import type { PlanRow } from "./plan-board";

/**
 * WHERE DOES THIS GO — the cascading chain of ancestor pickers.
 *
 * Pick a level and you are asked for exactly the ancestors that level needs: a
 * Sub-Action wants Project → Milestone → Result → Action, a Milestone wants
 * only a Project. Each select is fed from the one above it, so an impossible
 * pairing (an Action under someone else's Result) cannot be assembled at all
 * and the server's own parent-kind check never has to reject anything.
 *
 * ONE COPY, TWO DIALOGS. The single-row create dialog and the bulk upload ask
 * the identical question and must answer it identically — including which
 * ancestors are pre-filled from the last-accessed branch. This was inline in
 * the create dialog until bulk upload needed the same twenty lines.
 */

export type PickedAncestors = Partial<Record<PlanKind, string>>;

/** Depth-first lookup by id — the tree is small enough that an index is noise. */
export function findPlanNode(nodes: PlanRow[], id: string): PlanRow | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findPlanNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** The rows that could be this level of the chain, given what is picked above. */
export function optionsForLevel(tree: PlanRow[], level: PlanKind, picked: PickedAncestors): PlanRow[] {
  const parentLevel = PARENT_KIND[level];
  if (!parentLevel) return tree.filter((n) => n.kind === level);
  const parentId = picked[parentLevel];
  if (!parentId) return [];
  const parent = findPlanNode(tree, parentId);
  return parent ? parent.children.filter((c) => c.kind === level) : [];
}

/** The id a new row of `kind` would hang off, or null when it is a project. */
export function parentIdFor(kind: PlanKind, picked: PickedAncestors): string | null {
  const levels = ancestorLevels(kind);
  const own = levels[levels.length - 1];
  return own ? picked[own] ?? null : null;
}

/** True when the chain is short of the ancestor this level cannot do without. */
export function parentMissing(kind: PlanKind, picked: PickedAncestors): boolean {
  return ancestorLevels(kind).length > 0 && !parentIdFor(kind, picked);
}

/**
 * Choosing an ancestor invalidates everything below it — the milestone you had
 * chosen is not under the project you just switched to.
 */
export function pickAncestor(prev: PickedAncestors, level: PlanKind, id: string): PickedAncestors {
  const next: PickedAncestors = { ...prev };
  if (id) next[level] = id;
  else delete next[level];
  // Every level between this one and the deepest is now a stale answer.
  for (const k of Object.keys(next) as PlanKind[]) {
    if (ancestorLevels(k).includes(level)) delete next[k];
  }
  return next;
}

export function ParentPickers({
  tree,
  kind,
  picked,
  onChange,
  /** Marks the pre-filled selects, so "why is this already set?" has an answer. */
  seededFrom,
  className = "",
}: {
  tree: PlanRow[];
  kind: PlanKind;
  picked: PickedAncestors;
  onChange: (next: PickedAncestors) => void;
  seededFrom?: PickedAncestors;
  className?: string;
}) {
  const chain = ancestorLevels(kind);
  if (chain.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 gap-4 max-md:grid-cols-1 ${className}`}>
      {chain.map((level) => {
        const opts = optionsForLevel(tree, level, picked);
        const parentLevel = PARENT_KIND[level];
        const blocked = Boolean(parentLevel && !picked[parentLevel]);
        const seeded = seededFrom?.[level] && seededFrom[level] === picked[level];
        return (
          <div key={level} className="min-w-0">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              {KIND_LABEL[level]}
              {seeded && (
                <span
                  className="rounded-full bg-surface-soft px-1.5 py-px text-[9px] font-black tracking-normal text-ink-muted"
                  title="Filled in from the row you were last in"
                >
                  last opened
                </span>
              )}
            </p>
            <select
              value={picked[level] ?? ""}
              disabled={blocked}
              aria-label={KIND_LABEL[level]}
              onChange={(e) => onChange(pickAncestor(picked, level, e.target.value))}
              className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600] disabled:bg-surface-soft disabled:opacity-60"
            >
              <option value="">
                {blocked
                  ? `Choose a ${KIND_LABEL[parentLevel!].toLowerCase()} first`
                  : opts.length === 0
                    ? `No ${KIND_LABEL[level].toLowerCase()} here yet`
                    : `Choose a ${KIND_LABEL[level].toLowerCase()}…`}
              </option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || "(unnamed)"}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
