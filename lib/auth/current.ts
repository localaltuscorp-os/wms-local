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
import { resolveDeviceContext, touchLastSeen } from "@/lib/security/device-access";
import { canManageDevices } from "@/lib/security/capabilities";
import { resolveDelegation, type DelegationContext } from "@/lib/auth/delegated-access";
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
export const getSignedInEmployee = cache(async (): Promise<Employee | null> => {
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
 * TEMPORARY DELEGATED ACCESS — the live grant on this request, or null.
 *
 * Resolved from the REAL signed-in person, never from the effective one, so
 * delegation can never chain: an account being tested cannot itself be holding a
 * grant that forwards to a third person.
 *
 * Skipped entirely under the three no-login development modes. Each replaces
 * authentication wholesale and reads no cookies, so there is no delegate
 * identity for a grant to belong to; each is also hard-disabled under
 * NODE_ENV=production, so no deployment takes this branch.
 */
export const getDelegation = cache(async (): Promise<DelegationContext | null> => {
  if (DUMMY_MODE || devAuthBypassEnabled() || localSessionEnabled()) return null;
  const real = await getSignedInEmployee();
  if (!real) return null;
  // A candidate guest-account may neither delegate nor be delegated to. They can
  // reach exactly one page, and impersonation has no meaning there.
  if (isCandidateAccount(real)) return null;
  return await resolveDelegation(real.id);
});

/**
 * THE EFFECTIVE IDENTITY — who this request is acting as.
 *
 * Normally the signed-in employee. When a live temporary-access grant is
 * presented, the TARGET of that grant instead, so that every query, every
 * ownership filter and every existing authorization guard downstream sees the
 * account being tested — which is what "the temporary user only receives the
 * permissions of the account being tested" has to mean in practice. There is no
 * second authorization model for a delegated session; there is one model, asked
 * about a different person.
 *
 * ── WHY THE SWAP IS HERE AND NOT IN A MIDDLEWARE OR A LAYOUT ───────────────
 * Same reasoning as the device check below. This is the one function a page
 * render AND a server action AND a route handler all pass through. Putting the
 * swap anywhere shallower would leave surfaces that resolve identity by another
 * route — and an impersonation that applies to some requests and not others is
 * worse than none, because the two halves would write data as different people.
 *
 * Callers that need the REAL person — the audit log, the "acting as" banner, the
 * Admin Panel's own grant screen — use `getSignedInEmployee()`.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const real = await getSignedInEmployee();
  if (!real) return null;
  const delegation = await getDelegation();
  return delegation ? delegation.target : real;
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
 * Login + liveness ONLY - no role/candidate opinion, AND NO DEVICE CHECK.
 * Private to this module's guards: the candidate-form guards build on this so
 * they don't inherit requireUser's "candidates get redirected away" fork.
 */
async function requireSession(): Promise<Employee> {
  const e = await getCurrentEmployee();
  if (!e || !isLoginLive(e)) redirect("/login" as Route);
  return e;
}

/**
 * Signed in and live, with the DEVICE CHECK DELIBERATELY SKIPPED.
 *
 * Exists for exactly one surface: `/device-blocked`, the page an unauthorized
 * device is sent to. That page has to resolve who you are in order to tell you
 * which of your devices IS registered — and if it went through `requireUser()`
 * it would be redirected to itself, forever.
 *
 * Nothing else may use this. Every other surface goes through `requireUser()`.
 */
export async function requireSessionSkippingDeviceCheck(): Promise<Employee> {
  return await requireSession();
}

/**
 * The DEFAULT gate for every normal surface - redirects to /login if absent or
 * not-live, forks a candidate guest-account OUT to their form, AND refuses an
 * unauthorized DEVICE. It can therefore NEVER return a candidate: this is the
 * choke point that keeps candidates out of the entire app
 * (requireAdmin/requireSuperAdmin/requireWorkspace/requireHrStaff all funnel
 * through here). Throws via redirect.
 *
 * ── WHY THE DEVICE CHECK LIVES HERE ────────────────────────────────────────
 * The requirement is that an unregistered laptop cannot use the WMS AT ALL —
 * not that it sees a reduced UI. A layout can only gate what it renders, so a
 * layout-level check leaves every Server Action and every `POST` reachable: the
 * page would refuse to draw the button while the action behind it still ran.
 * `requireUser()` is the one function BOTH a page render and a server action
 * must pass through, so putting the check here means an unauthorized device
 * cannot reach protected functionality by any route, including a hand-crafted
 * request that never loads a page at all.
 *
 * ── THE COST, AND WHY IT IS ONE LOOKUP AND NOT TWENTY ──────────────────────
 * `requireUser()` runs many times in a single request — the root layout, the
 * route layout, the page, and every server action all call it. So the device
 * check is React-`cache()`d exactly as `getCurrentEmployee` is: one cookie read
 * and one indexed lookup on `mobile_devices.device_id` per REQUEST, reused by
 * every later caller. Uncached it would be a fresh query per call site, on the
 * hottest path in the application.
 *
 * The cache key is the employee object, which `getCurrentEmployee`'s own cache
 * makes a stable reference within a request — so the memoisation actually hits
 * rather than silently missing on a fresh object each time.
 */
export async function requireUser(): Promise<Employee> {
  const e = await requireSession();
  if (isCandidateAccount(e)) redirect("/candidate/form" as Route);

  // ── THE DEVICE CHECK RUNS ON THE REAL PERSON, NOT THE ONE BEING TESTED ───
  //
  // The brief's own scenario is "Rudra can log into Rutvisha's account FROM
  // RUDRA'S LAPTOP". Rudra's laptop is registered to Rudra, not to Rutvisha, so
  // checking the effective identity here would refuse the very case temporary
  // access exists for.
  //
  // Checking the real identity is also the STRICTER reading, which is why it is
  // the right one rather than merely the convenient one: Rudra remains confined
  // to Rudra's own approved devices for the whole delegated session, and a grant
  // can never lend out Rutvisha's registered devices to anybody. An
  // unregistered laptop gains nothing from holding a grant.
  //
  // `getSignedInEmployee` is the pre-swap resolution and is cached per request,
  // so this is a cache hit, not a second lookup.
  const real = (await getSignedInEmployee()) ?? e;
  await enforceWmsDeviceAccess(real);
  return e;
}

/**
 * Refuse an unauthorized device, by sending it to `/device-blocked`.
 *
 * A REDIRECT rather than a 403 throw, on purpose. The person is legitimately
 * signed in and has done nothing wrong — they are on the wrong laptop — so the
 * useful answer is a page that says which devices they may use and how to get
 * this one approved, not the generic error card. A crafted request that never
 * renders a page still gets the redirect, which is a refusal either way: the
 * server action's body does not run.
 *
 * SKIPPED for the three no-login development modes. Each one already replaces
 * authentication wholesale on a developer's machine, and each is hard-disabled
 * under `NODE_ENV=production` (see dummy-dir.ts / dev-bypass.ts /
 * local-session.ts), so no deployment can take these branches.
 */
const enforceWmsDeviceAccess = cache(async (e: Employee): Promise<void> => {
  if (DUMMY_MODE || devAuthBypassEnabled() || localSessionEnabled()) return;

  const ctx = await resolveDeviceContext(e);
  if (!ctx.allowed) redirect("/device-blocked" as Route);

  // Bookkeeping only — "is this laptop still in use" on the admin screen. Not
  // awaited in a way that can fail the request; `touchLastSeen` swallows its
  // own errors, and a device row is present on every authorized non-exempt path.
  if (ctx.device) void touchLastSeen(ctx.device.id);
});

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
 * Like requireUser but throws 403 unless the signed-in employee may APPROVE,
 * REGISTER or REVOKE devices (the `device.manage` capability — see
 * lib/security/capabilities.ts).
 *
 * NARROWER THAN `requireAttendanceAdmin`, deliberately. That guard's allow-list
 * covers the office-IP allowlist and the rest of attendance settings, and has
 * accumulated a fourth member; device authorization is the hinge the entire
 * access-control guarantee turns on — whoever can register a device against a
 * person can then act as that person — so it is granted to exactly the three
 * people named for it and read from the capability registry, not from an
 * attendance-settings list that will keep growing for unrelated reasons.
 */
export async function requireDeviceManager(): Promise<Employee> {
  const e = await requireUser();
  if (!canManageDevices(e.email)) throw forbiddenError();
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
