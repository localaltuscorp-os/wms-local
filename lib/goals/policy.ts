/**
 * Goals — the OPTION-A permission policy (unified-canvas redesign Phase 2):
 * "STRUCTURE is admin/manager, PROGRESS is everyone's".
 *
 * ONE pure function maps WHO the viewer is (relative to a goal's owner) to a
 * flag set every surface consults — the server actions re-derive it as the
 * source of truth (lib/goals/scope.ts `goalPolicyFor`), the canvas shell
 * resolves it once per viewed board and gates affordances client-side.
 *
 *   STRUCTURE (admin OR the owner's manager — never the bare owner):
 *     cross-level re-home · auto-divide · rebalance/redistribute ·
 *     editing a CASCADED goal's targets · deleting others' goals.
 *   PROGRESS / OWNERSHIP (the owner too):
 *     progress % · actuals · notes · reorder · same-level re-quarter ·
 *     creating their own child goals.
 *
 * Isomorphic on purpose — NO server-only import, no I/O: the client reuses the
 * exact same mapping for affordance gating (never as security; the actions
 * always re-derive).
 */

export interface GoalPolicyInput {
  /** Org-wide reach (app admin or super-admin) — requireGoalsAccess.isAdmin. */
  isAdmin: boolean;
  /** The viewer MANAGES the goal's owner (owner sits in the viewer's recursive
   *  downline — goalScopeFor/canManageGoalFor). Never true for the owner. */
  isManagerOfOwner: boolean;
  /** The viewer IS the goal's owner (goal.employeeId === me.id). */
  isOwner: boolean;
}

export interface GoalPolicy {
  /* ---- STRUCTURE — admin + manager-of-owner only (Option A) ---- */
  /** Re-home a goal ACROSS levels (year↔quarter↔month↔week↔day). */
  canRehomeLevel: boolean;
  /** Auto-divide a parent into cascade children (÷4 quarters / ÷3 months). */
  canAutoDivide: boolean;
  /** Apply a rebalance/redistribute of child targets. */
  canRebalance: boolean;
  /** Edit the TARGET of a cascaded (auto-generated) goal. */
  canEditCascadedTargets: boolean;
  /** Delete/archive a goal the viewer does NOT own. */
  canDeleteOthers: boolean;

  /* ---- PROGRESS / OWNERSHIP — the owner always keeps these ---- */
  /** Move a goal between SIBLING buckets at its own level (Q1→Q3, Jul→Aug). */
  canReQuarter: boolean;
  /** Progress % (pctDone) + actual qty/amount. */
  canEditProgress: boolean;
  /** Notes / dictation. */
  canEditNotes: boolean;
  /** Drag-reorder within a bucket. */
  canReorder: boolean;
  /** Manually create child goals under their own parents. */
  canCreateOwnChildren: boolean;
}

/** Shared denial copy — the server error AND the client disabled-reason read
 *  the same sentence, so the tooltip never promises what the action refuses. */
export const POLICY_REASONS = {
  rehomeLevel: "Only an admin or the owner's manager can move a goal across levels.",
  /** COPYING a goal into another level is deliberately a LOWER bar than moving
   *  it: the source stays put and the copy is an independent row the owner could
   *  create by hand anyway. Only someone with no write access at all is refused. */
  copyLevel: "You can only copy goals you own or manage.",
  autoDivide: "Only an admin or the owner's manager can auto-divide a goal.",
  rebalance: "Only an admin or the owner's manager can apply a rebalance.",
  cascadedTargets: "Cascaded targets are set by an admin or the owner's manager.",
  deleteOthers: "Only an admin or the owner's manager can delete someone else's goal.",
} as const;

/** Resolve the Option-A flag set. Pure — same inputs, same answer, anywhere. */
export function goalPolicy(i: GoalPolicyInput): GoalPolicy {
  const structure = i.isAdmin || i.isManagerOfOwner;
  const progress = structure || i.isOwner;
  return {
    // Structure is the admin's/manager's.
    canRehomeLevel: structure,
    canAutoDivide: structure,
    canRebalance: structure,
    canEditCascadedTargets: structure,
    canDeleteOthers: structure,
    // Progress is everyone's (everyone who may write the board at all).
    canReQuarter: progress,
    canEditProgress: progress,
    canEditNotes: progress,
    canReorder: progress,
    canCreateOwnChildren: progress,
  };
}
