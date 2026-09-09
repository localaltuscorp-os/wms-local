import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { readSession } from "@/lib/auth/session";
import { localSessionEnabled, localSessionEmployee } from "@/lib/auth/local-session";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { devAuthBypassEnabled, DEV_BYPASS_EMPLOYEE } from "@/lib/auth/dev-bypass";
import { isAttendanceAdmin } from "@/lib/auth/attendance-permissions";
import { FORBIDDEN_DIGEST as FORBIDDEN_DIGEST_VALUE } from "./forbidden";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

/** The seeded account DUMMY MODE signs in as. Mirrors scripts/dummy-db-seed.ts;
 *  duplicated as a plain string so this module never pulls in a script. */
const DUMMY_USER_EMAIL = "dummy.admin@example.invalid";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 * Looks up by Firebase UID.  Used inside Server Components / Server Actions.
 *
 * This is the single most-used query in the app - the root layout and every
 * authed request resolve it. It is React-`cache()`d, so the lookup runs at most
 * ONCE per request and the healthy result is reused everywhere. We load it
 * DIRECTLY (no timeout/retry wrapper): a slow read just takes a little longer
 * and completes - wrapping it in a hard timeout turned slow-but-fine reads into
 * thrown errors under load, which surfaced as "We hit a snag" / failed actions.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  // DUMMY MODE — Firebase is not contacted and no session cookie is read; you
  // are simply signed in as the seeded dummy admin. Because a REAL row is
  // returned (not a fabricated object), its id is a real foreign key, so every
  // "assigned to me" filter, ownership check and join behaves normally.
  //
  // Development only: DUMMY_MODE is hard-false under NODE_ENV=production, so a
  // production build cannot be talked into an unauthenticated session by an
  // environment variable. See lib/db/dummy-dir.ts.
  if (DUMMY_MODE) {
    const row = await db.query.employees.findFirst({
      where: eq(employees.email, DUMMY_USER_EMAIL),
    });
    if (!row) {
      throw new Error(
        `DUMMY_MODE is on but the dummy employee (${DUMMY_USER_EMAIL}) is missing. Run: pnpm dummy:setup`,
      );
    }
    return row;
  }

  // DEV_AUTH_BYPASS=true (.env.local, non-production only) - skip both the
  // Firebase session cookie AND the DB lookup below, so pages render without
  // a configured Firebase project or a live Supabase connection. See
  // lib/auth/dev-bypass.ts.
  if (devAuthBypassEnabled()) return DEV_BYPASS_EMPLOYEE;

  // Local no-login mode (DISABLE_AUTH=true, dev machines only — see
  // localSessionEnabled). Resolves a REAL employee row instead of verifying a
  // session cookie; every downstream query then runs against real data exactly
  // as it would for that signed-in person.
  if (localSessionEnabled()) return await localSessionEmployee();

  const claims = await readSession();
  if (!claims) return null;
  const row = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, claims.uid),
  });
  return row ?? null;
});

/**
 * The SINGLE login-liveness rule - used by every liveness gate (requireSession,
 * the session-cookie mint, the mobile auth). A real employee is live while
 * `isActive`; a candidate guest-account is live while `candidateActive` (a
 * candidate is always `isActive=false`, so it's excluded from every roster).
 *
 * A SYSTEM account (test / demo logins) follows the SAME hiding pattern as a
 * candidate, for the same reason: it is kept `isActive=false` so that the
 * ~120 roster queries which filter on `is_active = true` exclude it
 * AUTOMATICALLY - attendance boards, DCC rankings, PMS lists, pickers, team
 * views - without every one of them needing its own account_type filter (which
 * is the kind of sweep that always misses one). Its liveness is therefore
 * independent of `isActive`: the account still logs in and works normally.
 */
export function isLoginLive(e: Employee): boolean {
  if (e.accountType === "candidate") return e.candidateActive;
  if (e.accountType === "system") return true;
  return e.isActive;
}

/** True for a candidate guest-account (a job applicant's limited login). */
export function isCandidateAccount(e: Employee): boolean {
  return e.accountType === "candidate";
}

/**
 * Login + liveness ONLY - no role/candidate opinion. Private to this module's
 * guards: the candidate-form guards build on this so they don't inherit
 * requireUser's "candidates get redirected away" fork.
 */
async function requireSession(): Promise<Employee> {
  const e = await getCurrentEmployee();
  if (!e || !isLoginLive(e)) redirect("/login" as Route);
  return e;
}

/**
 * The DEFAULT gate for every normal surface - redirects to /login if absent or
 * not-live, AND forks a candidate guest-account OUT to their form. It can
 * therefore NEVER return a candidate: this is the choke point that keeps
 * candidates out of the entire app (requireAdmin/requireSuperAdmin/
 * requireWorkspace/requireHrStaff all funnel through here). Throws via redirect.
 */
export async function requireUser(): Promise<Employee> {
  const e = await requireSession();
  if (isCandidateAccount(e)) redirect("/candidate/form" as Route);
  return e;
}

/**
 * Gate for the candidate-form surface ONLY. Does NOT call requireUser (that
 * would redirect a candidate away in a loop). A non-candidate is bounced to the
 * hub.
 */
export async function requireCandidate(): Promise<Employee> {
  const e = await requireSession();
  if (!isCandidateAccount(e)) redirect("/hub" as Route);
  return e;
}

/**
 * Reject a candidate for handlers that resolved the employee via
 * `getCurrentEmployee()` directly (bypassing the requireUser choke point). Pass
 * the resolved row; a candidate is redirected to their form.
 */
export function guardNotCandidate(e: Employee): Employee {
  if (isCandidateAccount(e)) redirect("/candidate/form" as Route);
  return e;
}

/**
 * The 403 marker lives in `./forbidden` so the client error boundaries - which
 * cannot import this `server-only` module - recognise exactly what these guards
 * raise. Re-exported here so server callers have one import.
 */
export { FORBIDDEN_DIGEST, isForbiddenError } from "./forbidden";

/**
 * Build the 403. Message AND digest are both set: the message keeps server logs
 * readable, the digest is what survives redaction on the way to the browser.
 */
export function forbiddenError(): Error & { digest: string } {
  const err = new Error("Forbidden") as Error & { digest: string };
  err.digest = FORBIDDEN_DIGEST_VALUE;
  return err;
}

/**
 * Like requireUser but additionally throws 403 if not admin.
 * Throws an Error so Next renders error.tsx.
 */
export async function requireAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!e.isAdmin) throw forbiddenError();
  return e;
}

/**
 * Like requireUser but throws unless the signed-in employee may administer
 * DEVICES AND ATTENDANCE SETTINGS (the `ATTENDANCE_ADMIN_EMAILS` allow-list).
 *
 * Deliberately NOT "admin AND on the list" - being an admin grants nothing here.
 * Whoever can register a device against a person can punch as that person, so
 * this capability has to be narrower than admin for the anti-proxy allowlist to
 * mean anything at all.
 */
export async function requireAttendanceAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!isAttendanceAdmin(e.email)) throw forbiddenError();
  return e;
}

/**
 * Like requireUser but additionally throws 403 unless the signed-in employee is
 * a super-admin (the `SUPER_ADMIN_EMAILS` allow-list). Used to gate the
 * Weekly-Goals review/approve/archive flow - those writes are super-admins only.
 */
export async function requireSuperAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!isSuperAdmin(e.email)) throw forbiddenError();
  return e;
}

/**
 * Mandatory weekly-goals fill gate (design §11), defense-in-depth for mutating
 * server actions: a user with un-filled current-week goals assigned to them is
 * blocked from POSTing actions until they fill them (the authed layout performs
 * the primary redirect). Applies to EVERYONE - admins and super-admins included.
 *
 * The actual EXISTS check lives in the query layer (`hasUnfilledWeekGoals`,
 * added by the weekly-goals query-layer work); we import it lazily so this guard
 * file has no hard build-time dependency on that module landing first. If the
 * gate module isn't present yet the guard fails open (no-op) rather than break
 * unrelated actions.
 *
 * @param me the already-resolved current employee (callers pass requireUser()'s result).
 * @returns the same employee, for ergonomic chaining; throws "Fill your weekly goals" when gated.
 */
export async function requireWeeklyGoalsFilled(me: Employee): Promise<Employee> {
  // ⚠️ 2026-07-27: gate FORCE-DISABLED. It used to throw "Fill your weekly goals
  // to continue" when the user had unfilled current-week goals - an UNHANDLED
  // throw that bubbled to the error boundary as "We hit a snag." and blocked task
  // creation (createTask + the mobile create path). Consistent with the other
  // daily-flow gates being off, this is now a no-op. To restore, put back the
  // `hasUnfilledWeekGoals(me.id)` check + `throw new Error(...)`.
  return me;
}
