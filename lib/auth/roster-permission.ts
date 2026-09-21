import { canManageTaskRosters } from "@/lib/security/capabilities";

/**
 * WHO MAY GROW THE SHARED ROSTERS — the "+ Add new client…" / "+ Add new
 * subject…" affordances on the task forms.
 *
 * MANAN SIR, JEEVAN AND ROHAN ONLY (account holder, 2026-09-15) — the holders
 * of `task_rosters.manage` (lib/security/capabilities.ts), the same people who
 * change the Subject and Client lists in the Admin Panel. Being an admin no
 * longer grants it: the rosters are shared, and a misspelling added here becomes
 * a permanent second client or subject that quietly splits one entity's task
 * history in two, which nothing in the product merges back — see migration
 * 0190, which had to rewrite 347 rows to undo exactly that kind of drift.
 *
 * PURE — no DB, no I/O. Both the server actions that ENFORCE this and the
 * loaders that decide whether to SHOW the affordance read this one definition,
 * so the button and the action can never disagree.
 *
 * ⚠ The UI check only hides a button. `quickAddClient` / `quickAddSubject` in
 * app/(app)/tasks/actions.ts are the checks that actually hold.
 */
export function canAddTaskRoster(me: {
  isAdmin: boolean;
  email?: string | null;
}): boolean {
  return canManageTaskRosters(me.email);
}
