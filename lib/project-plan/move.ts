/**
 * Project Plan — the shape of a DRAG-AND-DROP MOVE, and the sentence that
 * describes it.
 *
 * Its own module for the same reason `UNCLASSIFIED_MILESTONE` is in
 * levels.ts: `app/(app)/project-plan/actions.ts` carries `"use server"`, and
 * such a file may export nothing but async functions. The type the confirm
 * dialog reads and the wording it shows therefore cannot live beside the action
 * that produces them.
 *
 * Client-SAFE (no `server-only`, no db import): the dialog renders this in the
 * browser.
 */

import { KIND_LABEL, type PlanKind } from "./levels";

/** What the confirm dialog shows before anything is written. */
export interface PlanMovePlan {
  /** The dragged row. */
  nodeKind: PlanKind;
  nodeName: string;
  /** The project it is in NOW, and the one it is going to. */
  fromProjectId: string;
  fromProjectName: string;
  toProjectId: string;
  toProjectName: string;
  /** True when the drop only re-files the row inside the same project. */
  sameProject: boolean;
  /** The row it will hang off once the move is done. Its name is the CURRENT
   *  name for a row that exists, or the placeholder name for one that does
   *  not yet. */
  parentKind: PlanKind;
  parentName: string;
  /** Levels that have to be CREATED to make the drop legal, outermost first.
   *  Empty when the target already has somewhere to put the row. */
  creates: Array<{ kind: PlanKind; name: string }>;
  /** Everything that travels with it, counted per level. */
  carries: Array<{ kind: PlanKind; count: number }>;
  /** Linked WMS tasks under the branch — they move with it, they are not
   *  re-created. */
  taskCount: number;
}

/** "3 Results, 5 Actions" — the plural-aware list of what comes along. */
export function describeCarried(carries: PlanMovePlan["carries"]): string {
  if (carries.length === 0) return "";
  return carries
    .map(({ kind, count }) => {
      const label = KIND_LABEL[kind];
      // "Sub-Action" → "Sub-Actions"; nothing here ends in s, y or ch, so a
      // bare "s" is the whole rule.
      return `${count} ${count === 1 ? label : `${label}s`}`;
    })
    .join(", ");
}

/**
 * The question the popup asks, in one sentence.
 *
 * Built here rather than in the component so the wording is testable without
 * rendering, and so the two places a move can be confirmed from — the
 * hierarchy board and (later) anywhere else — ask it identically.
 */
export function describeMove(plan: PlanMovePlan): string {
  const what = `${KIND_LABEL[plan.nodeKind]} "${plan.nodeName}"`;
  return plan.sameProject
    ? `Move ${what} under ${KIND_LABEL[plan.parentKind]} "${plan.parentName}"?`
    : `Move ${what} to the project "${plan.toProjectName}"?`;
}
