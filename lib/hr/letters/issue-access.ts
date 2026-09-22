import "server-only";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { hasCapabilityGrant } from "@/lib/security/capability-grants";
import type { Employee } from "@/db/schema";

/**
 * MAY THIS PERSON CREATE, ISSUE AND EMAIL HR LETTERS?
 *
 * ── WHAT THIS REPLACES, AND WHY IT MATTERED ────────────────────────────────
 * Three separate places each answered this with `me.isAdmin || isSuperAdmin(me.email)`:
 * the letter page, `lib/hr/letters/issue-core.ts` (its own private copy), and
 * `app/api/hr/letters/email-pdf/route.ts`. So "can send an appointment letter"
 * and "can manage every employee and setting in the application" were the same
 * bit — the only way to let an HR person send a letter was to make them a full
 * admin. That is a much larger grant than the job, and it is exactly what the
 * owner hit.
 *
 * It is also three copies of a security decision, which is how the copies drift.
 * There is now one.
 *
 * ── THE ORDER MATTERS ──────────────────────────────────────────────────────
 * Admins and super-admins short-circuit WITHOUT a database read: they held this
 * before the capability existed, and their behaviour must not change or depend
 * on a table being reachable. Only the new, narrower grant costs a query, and
 * `grantsFor` memoizes it per request.
 */
export async function canIssueLetters(
  me: Pick<Employee, "email" | "isAdmin">,
): Promise<boolean> {
  if (me.isAdmin) return true;
  if (isSuperAdmin(me.email)) return true;
  return hasCapabilityGrant(me.email, "hr.letters.issue");
}

/**
 * The refusal every issuance path returns when the answer is no.
 *
 * One string, so a person who is refused by the route gets the same sentence
 * they would have got from the page — and so the reason is stated rather than
 * appearing as a bare "Forbidden". It names no one: the recipient of a refusal
 * is by definition not the person who can fix it.
 */
export const LETTER_ISSUE_REFUSAL =
  "You do not have permission to issue letters. Ask an administrator to grant you “Issue letters” on your employee record.";
