import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * WHO MAY GROW THE SHARED ROSTERS — the "+ Add new client…" / "+ Add new
 * subject…" affordances on the task forms.
 *
 * ADMINS AND SUPER-ADMINS ONLY (Sir). The rosters are shared: a misspelling
 * added here becomes a permanent second client or subject that quietly splits
 * one entity's task history in two, and nothing in the product merges them back
 * — see migration 0190, which had to rewrite 347 rows to undo exactly that kind
 * of drift.
 *
 * WHY SUPER-ADMIN IS ITS OWN CLAUSE AND NOT ASSUMED: `is_admin` is a database
 * column and the super-admin allow-list is code, and they are NOT the same set.
 * A super-admin whose employee row carries `is_admin = false` (as Hetesh's once
 * did) would be locked out of a capability every ordinary admin has by a bare
 * `me.isAdmin`. Checking both is what makes "admins and super-admins" true
 * however the two lists drift.
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
  return me.isAdmin || isSuperAdmin(me.email);
}
