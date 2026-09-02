import "server-only";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";

/**
 * The ONE authorisation rule for reading a filled form: you may see a submission
 * if it is YOURS, or if you are HR staff.
 *
 * Every read surface calls this — the View page, the PDF route and the email
 * route — because a list-level gate only protects the list. Without it, a
 * non-HR employee who knows (or guesses) a submission id could pull someone
 * else's exit interview straight from `/api/hr/forms/<id>/pdf`, which never
 * renders the list at all.
 *
 * `isHrStaff` (not `isAdmin`) is the right predicate: it covers super-admins AND
 * the HR department, matching `requireHrStaff` on /hr/all-forms. Using `isAdmin`
 * here would lock out the HR team that owns these forms.
 *
 * Returns a verdict rather than redirecting, so each caller can respond in its
 * own idiom — the page 404s (revealing nothing about whether the id exists), the
 * API routes return a status code.
 */
export async function canViewHrSubmission(
  submissionEmployeeId: string | null,
): Promise<{ allowed: boolean; isHrStaff: boolean; meId: string }> {
  const me = await requireUser();
  const hrStaff = await isHrStaff(me);
  // NULL means the subject is a CANDIDATE (migration 0203), who by definition has
  // no login here — so "is it mine?" has no true answer and HR staff is the only
  // way in. Comparing `me.id === null` would be false anyway, but stating it
  // makes the rule deliberate rather than an accident of the comparison.
  const mine = submissionEmployeeId !== null && me.id === submissionEmployeeId;
  return {
    allowed: hrStaff || mine,
    isHrStaff: hrStaff,
    meId: me.id,
  };
}
