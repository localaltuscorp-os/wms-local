import "server-only";

import { getCurrentEmployee, getSignedInEmployee } from "@/lib/auth/current";
import { canManageIncentiveEligibility } from "@/lib/security/capabilities";

/**
 * MAY THE PERSON AT THE KEYBOARD CHANGE INCENTIVE ELIGIBILITY?
 *
 * ── ONE FUNCTION, TWO CALLERS, NO WAY FOR THEM TO DISAGREE ─────────────────
 * The page asks this to decide whether to render the Add / Remove controls, and
 * every eligibility action asks it to decide whether to obey. Those must be the
 * same answer: a visible button that refuses is a bug report, and a hidden one
 * that would have worked is a mystery. They are the same answer because this is
 * the only place the question is written down.
 *
 * The brief wants both halves — "Only Manan Vasa can change eligibility" and
 * "Enforce Manan's eligibility-edit permission server-side" — and the second is
 * the one that matters. A server action is an HTTP endpoint; it is reachable
 * whether or not the button ever rendered.
 *
 * ── BOTH IDENTITIES MUST HOLD THE CAPABILITY ───────────────────────────────
 * Under temporary delegated access the EFFECTIVE employee is the account being
 * used and the REAL one is the person using it. Both are checked, following
 * lib/billing/delete-guard.ts:
 *
 *   · EFFECTIVE — so Manan, while delegated into somebody else's account,
 *     cannot change eligibility. He is there to see what they see, and an
 *     `added_by_id` naming that person would be false.
 *   · REAL — so nobody delegated into a privileged account inherits the
 *     authority. `isPrivilegedAccount` in lib/auth/delegation-permission.ts
 *     already refuses Manan as a delegation target, so this is closed twice;
 *     closing it here too means the guarantee does not depend on a rule in
 *     another module that could be relaxed without anyone thinking about this.
 *
 * Fails CLOSED — nobody signed in changes nothing.
 */
export async function mayManageIncentiveEligibility(): Promise<boolean> {
  const [effective, real] = await Promise.all([getCurrentEmployee(), getSignedInEmployee()]);
  if (!effective || !real) return false;
  return canManageIncentiveEligibility(effective.email) && canManageIncentiveEligibility(real.email);
}
