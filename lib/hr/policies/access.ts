import "server-only";
import type { Employee } from "@/db/schema";
import { isHrStaff } from "@/lib/hr/access";

/**
 * WHO MAY PUBLISH OR REMOVE A FIRM POLICY.
 *
 * HR staff, and super-admins. That is `isHrStaff` (lib/hr/access.ts): membership
 * of the HR department, or the super-admin list. Reading a policy stays
 * company-wide; only writing is narrow.
 *
 * ── WHY THIS IS NOT A LIST OF PEOPLE (account holder, 2026-09-21) ──────────
 * It was: two addresses, plus a fallback that admitted anyone whose NAME
 * contained "manan", "ruchita" or "rutvisha". The fallback existed so a person
 * signing in with an address other than the one hardcoded would still get in,
 * and it cost more than it bought — `name.includes("ruchita")` also admits
 * Suruchita, and `includes("manan")` admits Mananjay. Publishing a policy is
 * the act of putting a document in front of the whole firm to sign, so it must
 * turn on something a namesake cannot borrow.
 *
 * A ROLE is also the answer to the other half of the problem: adding or removing
 * a publisher is now a change on the Employee Master, not a code deploy.
 */

/** The dummy database signs in as this account, so it may publish there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

/**
 * May this person upload a policy, or remove one?
 *
 * `dummyMode` is passed by the caller from DUMMY_MODE, which is forced off in
 * production — so the dummy admin is admitted on port 3002 and nowhere else.
 */
export async function canPublishPolicies(me: Employee, dummyMode = false): Promise<boolean> {
  if (dummyMode && (me.email ?? "").trim().toLowerCase() === DUMMY_EMAIL) return true;
  return await isHrStaff(me);
}
