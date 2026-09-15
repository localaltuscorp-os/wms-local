import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  canGrantAnyDelegatedAccess,
  hasCapability,
  isMasterAdmin,
} from "@/lib/security/capabilities";

/**
 * WHO MAY GRANT TEMPORARY DELEGATED ACCESS, AND FOR WHOM.
 *
 * The brief: "Managers should only be able to grant temporary access if the
 * existing authorization hierarchy allows them to do so. Do not allow ordinary
 * employees to grant temporary access unless explicitly authorized by the
 * existing role system."
 *
 * So this reads the ORG CHART rather than introducing a role of its own —
 * `getDownlineIds`, the same transitive `employees.manager_id` walk that Weekly
 * Goals already uses to decide who a manager may act for. A manager may hand out
 * access WITHIN THEIR OWN TEAM and nowhere else; someone with nobody reporting
 * to them can grant nothing, because the hierarchy gives them no one to grant
 * over.
 *
 * The only way past the hierarchy is the `delegated_access.grant_any`
 * capability, held by the two people named in the capability registry.
 */

/** Why a grant was refused. Returned rather than thrown so the caller renders it. */
export type DelegationRefusal =
  | "not_authorized"
  | "target_not_found"
  | "delegate_not_found"
  | "target_inactive"
  | "delegate_inactive"
  | "target_is_candidate"
  | "delegate_is_candidate"
  | "self"
  | "target_privileged"
  | "target_not_in_team"
  | "delegate_not_in_team";

export const DELEGATION_REFUSAL_MESSAGES: Record<DelegationRefusal, string> = {
  not_authorized: "You are not authorized to grant temporary access.",
  target_not_found: "That employee could not be found.",
  delegate_not_found: "That person could not be found.",
  target_inactive: "That employee's account is not active.",
  delegate_inactive: "That person's account is not active.",
  target_is_candidate: "A candidate account cannot be tested this way.",
  delegate_is_candidate: "A candidate account cannot be given temporary access.",
  self: "Temporary access to your own account is not needed.",
  target_privileged:
    "That account holds elevated administrative rights, so it cannot be accessed through temporary access.",
  target_not_in_team: "You can only grant access to accounts in your own team.",
  delegate_not_in_team: "You can only grant access to people in your own team.",
};

/**
 * ACCOUNTS THAT MAY NEVER BE IMPERSONATED.
 *
 * ── THE ESCALATION THIS CLOSES ─────────────────────────────────────────────
 * Every capability in this application is keyed on `employees.email`, and a
 * delegated session resolves the current employee to the TARGET's row — the
 * target's email included. So delegated access to a master admin's account
 * would confer `master_admin.manage`, and access to a device administrator's
 * would confer `device.manage`. Both are the highest privileges in the system,
 * and either would be obtained without the holder's involvement.
 *
 * "It's only for testing" is not a mitigation: the delegate is a normal
 * employee at a normal keyboard with the founder's permissions and an audit row
 * that says a manager approved it.
 *
 * So privileged accounts are excluded OUTRIGHT — not gated behind
 * `grant_any`, because the person holding `grant_any` is exactly who could use
 * it to impersonate the other master admin. Testing a privileged account means
 * signing into it, which is what a password is for.
 */
function isPrivilegedAccount(e: Employee): boolean {
  return (
    isMasterAdmin(e.email) ||
    isSuperAdmin(e.email) ||
    canGrantAnyDelegatedAccess(e.email) ||
    hasCapability(e.email, "device.manage") ||
    hasCapability(e.email, "attendance.manage_others") ||
    hasCapability(e.email, "device.exempt_from_restriction")
  );
}

export interface DelegationCheck {
  ok: boolean;
  refusal?: DelegationRefusal;
}

/**
 * May `granter` give `delegateId` temporary access to `targetId`?
 *
 * Checked in the order a person would ask the questions, so the message they get
 * back is the most useful one rather than the first one that happened to fail.
 *
 * BOTH sides must be in the granter's team, not just the account being tested.
 * A manager who could nominate anyone in the company as the delegate would be
 * able to hand their own team's accounts to an outsider, which is the same
 * exposure from the other direction.
 */
export async function checkDelegationGrant(
  granter: Employee,
  targetId: string,
  delegateId: string,
): Promise<DelegationCheck> {
  if (targetId === delegateId) return { ok: false, refusal: "self" };

  const [target, delegate] = await Promise.all([
    db.query.employees.findFirst({ where: eq(employees.id, targetId) }),
    db.query.employees.findFirst({ where: eq(employees.id, delegateId) }),
  ]);

  if (!target) return { ok: false, refusal: "target_not_found" };
  if (!delegate) return { ok: false, refusal: "delegate_not_found" };
  if (target.accountType === "candidate") return { ok: false, refusal: "target_is_candidate" };
  if (delegate.accountType === "candidate") return { ok: false, refusal: "delegate_is_candidate" };
  if (!target.isActive) return { ok: false, refusal: "target_inactive" };
  if (!delegate.isActive) return { ok: false, refusal: "delegate_inactive" };

  // Checked BEFORE the hierarchy, so the answer does not depend on who is
  // asking: a privileged account is off limits to everybody, including the
  // capability holders.
  if (isPrivilegedAccount(target)) return { ok: false, refusal: "target_privileged" };

  // The capability bypasses the ORG CHART only — never the checks above.
  if (canGrantAnyDelegatedAccess(granter.email)) return { ok: true };

  const downline = await getDownlineIds(granter.id);
  const team = new Set(downline);
  if (team.size === 0) return { ok: false, refusal: "not_authorized" };

  if (!team.has(targetId)) return { ok: false, refusal: "target_not_in_team" };
  // The granter may nominate THEMSELVES as the delegate — a manager testing
  // their own report's account is the ordinary case, and they are not in their
  // own downline.
  if (delegateId !== granter.id && !team.has(delegateId)) {
    return { ok: false, refusal: "delegate_not_in_team" };
  }

  return { ok: true };
}

/**
 * May this person open the Temporary Access screen at all?
 *
 * True for a capability holder, and for anyone with at least one active person
 * below them in the org chart. Deliberately DERIVED from the hierarchy rather
 * than from `isAdmin`: an admin with no reports has nobody they are responsible
 * for, and "is an administrator" is not the same claim as "manages these
 * people". The same derivation the nav already uses for the Team Performance
 * entry (`directReportIds(...).length > 0`).
 */
export async function canOpenDelegatedAccess(me: Employee): Promise<boolean> {
  if (canGrantAnyDelegatedAccess(me.email)) return true;
  const downline = await getDownlineIds(me.id);
  return downline.length > 0;
}

/**
 * The accounts this person may act on — used to populate the two pickers so the
 * screen only ever offers choices that will pass `checkDelegationGrant`.
 *
 * A privileged account is filtered out here as well as refused there. Offering a
 * choice that is then rejected teaches people to distrust the form; and the
 * exclusion is not a secret worth keeping, since the capability registry is in
 * the repository.
 */
export async function delegationCandidates(me: Employee): Promise<{
  targets: { id: string; name: string; email: string }[];
  delegates: { id: string; name: string; email: string }[];
}> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      accountType: employees.accountType,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.isActive, true));

  const staff = rows.filter((r) => r.accountType === "employee");
  const anywhere = canGrantAnyDelegatedAccess(me.email);
  const team = anywhere ? null : new Set(await getDownlineIds(me.id));

  const inScope = (id: string) => (team ? team.has(id) : true);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return {
    targets: staff
      .filter((r) => inScope(r.id) && !isPrivilegedAccount(r as unknown as Employee))
      .map(({ id, name, email }) => ({ id, name, email }))
      .sort(byName),
    delegates: staff
      .filter((r) => r.id === me.id || inScope(r.id))
      .map(({ id, name, email }) => ({ id, name, email }))
      .sort(byName),
  };
}
