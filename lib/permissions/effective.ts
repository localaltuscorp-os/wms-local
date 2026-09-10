/**
 * TURNING STORED OVERRIDES INTO AN ANSWER.
 *
 * PURE — no DB, no `server-only`. The server guards call this after loading a
 * person's overrides; the Master Admin screen calls it to preview what a change
 * will do before saving. One implementation, so the preview cannot lie.
 *
 * ── THE TWO RULES ──────────────────────────────────────────────────────────
 *
 * 1. A MISSING ROW IS NOT A DENIAL. It means "this matrix has no opinion; use
 *    the authorization the application already has". Anything else would lock
 *    every module for everybody the moment the feature shipped, and each of
 *    those lockouts would look like a bug rather than a policy.
 *
 * 2. DENIAL CASCADES DOWNWARD. The effective answer for a node is the AND of
 *    its own override and every ancestor's. Switching off WMS must take Tasks
 *    and Task Report with it — otherwise hiding a module leaves every page in it
 *    reachable by typing the URL, which is the most likely way for a permission
 *    system to be quietly useless.
 *
 *    The converse is deliberately NOT true: granting a child does not re-open a
 *    denied parent. There is no "allow" that overrides a deny, because a matrix
 *    where a leaf can undo its own module's restriction cannot be reasoned about
 *    from the screen an administrator is looking at.
 *
 * ── AND VIEW IMPLIES SHOW, EDIT IMPLIES VIEW ───────────────────────────────
 * The three actions are stored independently (the brief treats them
 * independently, and hidden-but-readable is a real configuration — a surface
 * reached by deep link from an email but kept off the rail). But they are not
 * unordered: EDIT without VIEW would let someone change data they cannot read,
 * which is never a policy anybody means. So `edit` is additionally gated on
 * `view`. SHOW is left free of VIEW, because hiding a readable page is
 * meaningful while the reverse is not.
 */

import { nodeChain } from "./catalog";
import type { PermissionAction } from "./catalog";

/** One stored override, as the matrix screen and the DB both see it. */
export interface PermissionOverride {
  canShow: boolean;
  canView: boolean;
  canEdit: boolean;
}

/** node_key → override. Absent key = no opinion (see rule 1). */
export type OverrideMap = ReadonlyMap<string, PermissionOverride>;

export interface EffectivePermission {
  show: boolean;
  view: boolean;
  edit: boolean;
  /**
   * The ancestor (or the node itself) whose override produced a denial, when
   * one did. The Master Admin screen shows this so an administrator wondering
   * why a leaf is off is told which switch did it, rather than left to compare
   * rows by eye.
   */
  deniedBy?: { show?: string; view?: string; edit?: string };
}

const ALL_ALLOWED: EffectivePermission = { show: true, view: true, edit: true };

/** Everything allowed — the answer for an unknown key, and for someone the
 *  matrix does not govern at all. */
export function allowAll(): EffectivePermission {
  return { ...ALL_ALLOWED };
}

/**
 * The effective permission for one node, given a person's overrides.
 *
 * Walks the chain from the module down to the node, ANDing as it goes and
 * remembering the first denial for each action.
 */
export function effectiveFor(nodeKey: string, overrides: OverrideMap): EffectivePermission {
  const chain = nodeChain(nodeKey);
  // An unknown key governs nothing. Returning "allowed" rather than "denied" is
  // the same rule as a missing row: a guard naming a node the catalogue has
  // dropped must not start refusing everyone silently.
  if (chain.length === 0) return allowAll();

  let show = true;
  let view = true;
  let edit = true;
  const deniedBy: { show?: string; view?: string; edit?: string } = {};

  for (const key of chain) {
    const o = overrides.get(key);
    if (!o) continue;
    if (show && !o.canShow) {
      show = false;
      deniedBy.show = key;
    }
    if (view && !o.canView) {
      view = false;
      deniedBy.view = key;
    }
    if (edit && !o.canEdit) {
      edit = false;
      deniedBy.edit = key;
    }
  }

  // EDIT IMPLIES VIEW — see this file's header.
  if (!view && edit) {
    edit = false;
    deniedBy.edit = deniedBy.view;
  }

  const out: EffectivePermission = { show, view, edit };
  if (deniedBy.show || deniedBy.view || deniedBy.edit) out.deniedBy = deniedBy;
  return out;
}

/** One action, for the common case where the caller wants a boolean. */
export function isAllowed(
  nodeKey: string,
  action: PermissionAction,
  overrides: OverrideMap,
): boolean {
  const eff = effectiveFor(nodeKey, overrides);
  return action === "show" ? eff.show : action === "view" ? eff.view : eff.edit;
}

/**
 * Is this override row worth keeping?
 *
 * An all-true row is indistinguishable in effect from no row at all, so the
 * write path deletes it instead of storing it. That keeps "has an explicit
 * override" meaningful on the matrix screen — a node shows as customised only
 * when something is actually restricted — and stops the table filling with rows
 * that say nothing.
 */
export function isMeaningfulOverride(o: PermissionOverride): boolean {
  return !(o.canShow && o.canView && o.canEdit);
}
