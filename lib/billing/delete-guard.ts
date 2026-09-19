import "server-only";

import { getCurrentEmployee, getSignedInEmployee } from "@/lib/auth/current";
import { canDeleteBillingEntity } from "@/lib/security/capabilities";

/**
 * MAY THE PERSON AT THE KEYBOARD DELETE A BILLING ENTITY?
 *
 * ── ONE FUNCTION, TWO CALLERS, NO WAY FOR THEM TO DISAGREE ─────────────────
 * The page asks this to decide whether to render the Delete control, and the
 * server action asks it to decide whether to obey. Those must be the same
 * answer: a visible button that refuses is a bug report, and a hidden one that
 * would have worked is a mystery. They are the same answer because this is the
 * only place the question is written down.
 *
 * The brief wants both halves — "Hide the delete action for unauthorized users
 * AND enforce the restriction server-side" — and the second is the one that
 * matters. The action is an HTTP endpoint; it is reachable whether or not the
 * button rendered.
 *
 * ── BOTH IDENTITIES MUST HOLD THE CAPABILITY ───────────────────────────────
 * Under temporary delegated access the EFFECTIVE employee is the account being
 * tested and the REAL one is the person testing it. Both are checked, because
 * they are different questions and both answers must be yes:
 *
 *   · EFFECTIVE — so Manan, while delegated into somebody else's account,
 *     cannot delete. He is there to see what they see, and an audit row saying
 *     that person deleted an entity would be false.
 *   · REAL — so nobody delegated into a privileged account could inherit the
 *     authority. `isPrivilegedAccount` in lib/auth/delegation-permission.ts
 *     already refuses Manan as a delegation target, so this is closed twice.
 *     Closing it here as well means the guarantee does not depend on a rule
 *     that lives in another module and could be relaxed without anyone
 *     thinking about this one.
 *
 * The net effect is the brief read literally: only Manan, signed in as himself.
 *
 * Fails CLOSED — nobody signed in deletes nothing.
 */
export async function mayDeleteBillingEntity(): Promise<boolean> {
  const [effective, real] = await Promise.all([getCurrentEmployee(), getSignedInEmployee()]);
  if (!effective || !real) return false;
  return canDeleteBillingEntity(effective.email) && canDeleteBillingEntity(real.email);
}
