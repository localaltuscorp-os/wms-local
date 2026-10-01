import "server-only";
import type { Employee } from "@/db/schema";
import { isHrStaff } from "@/lib/hr/access";

/**
 * WHO MAY CHANGE THE HOLIDAY CALENDAR — HR staff and super-admins.
 *
 * That is `isHrStaff` (lib/hr/access.ts): membership of the "HR" department,
 * or the super-admin list. A holiday row is not a cosmetic record —
 * `lib/queries/attendance-status.ts` reads the same table and marks that date
 * a holiday on every employee's attendance for the month, which moves working-
 * day counts, hour targets and ultimately pay. So the capability stays off
 * `isAdmin` in general, but it is no longer two named email addresses either
 * (account holder, 2026-09-29 — "give the ability to super admins and HR team
 * instead of hardcoding emails").
 *
 * ── THE SAME CHANGE, ALREADY MADE ONCE ──────────────────────────────────────
 * `lib/hr/policies/access.ts` (`canPublishPolicies`) solved this identical
 * problem for firm policies on 2026-09-21: a two-address list plus a NAME
 * fallback that let a namesake ("Suruchita" matched `includes("ruchita")")
 * borrow the grant. Moving to `isHrStaff` fixed both — a role instead of a
 * list, so granting or revoking is a change on the Employee Master's
 * department field, not a code deploy. This mirrors that fix exactly,
 * `dummyMode` escape hatch included.
 *
 * ── PURE, MINUS THE DB READ ─────────────────────────────────────────────────
 * `isHrStaff` needs a department lookup, so this is `server-only` (it never
 * was truly client-safe before either — nothing outside a server file ever
 * imported it). The server guards that use it live alongside the writes
 * themselves (app/(app)/hr/holidays/actions.ts, app/(admin)/admin/holidays/
 * actions.ts); the UI hiding the form is a convenience, never the control.
 */

/** The dummy database signs in as this account, so it may manage holidays there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

/**
 * May this person add, edit or remove an ad-hoc holiday?
 *
 * `dummyMode` is passed by the caller from DUMMY_MODE, which is forced off in
 * production — so the dummy admin is admitted on port 3002 and nowhere else.
 */
export async function canManageHolidays(
  me: Employee | null | undefined,
  dummyMode = false,
): Promise<boolean> {
  if (!me) return false;
  if (dummyMode && (me.email ?? "").trim().toLowerCase() === DUMMY_EMAIL) return true;
  return isHrStaff(me);
}
