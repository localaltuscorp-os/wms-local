/**
 * POLICIES — who may publish one.
 *
 * A policy is company-wide: everyone signed in READS the list, and only the
 * three people named here may UPLOAD or REMOVE one (asked for 2026-09-17).
 *
 * BEING AN ADMIN IS NOT ENOUGH, and neither is being a super-admin. Both flags
 * are held by more people than the three, and the point of the rule is that the
 * handbook has a named set of authors. This deliberately narrows what
 * `app/(app)/policies/actions.ts` used to allow.
 *
 * Matched by EMAIL first — the identity a namesake cannot borrow — with a name
 * fallback for accounts whose address differs from the one recorded here. The
 * same belt-and-braces shape as lib/client-engagement/access.ts and lib/hh/
 * access.ts, which this sits beside.
 *
 * 🔴 RUTVISHA HAS NO EMAIL HERE ON PURPOSE. On 17 September she had no
 * `employees` row at all — she exists only in `pa_people` ("Rutvisha",
 * "Rutvisha Mehta"), so she has no account to sign in with. The name fallback
 * is what will admit her the moment she gets one; add her address to
 * PUBLISHERS_BY_EMAIL then, because a name match is the weaker of the two.
 *
 * PURE: takes the person and the mode, reads no database and no environment, so
 * the rule itself is unit-tested rather than inferred.
 */

export interface PolicyActor {
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean | null;
}

/** The three people named. */
const PUBLISHERS_BY_EMAIL: readonly string[] = [
  "manan@unleashed.in",
  "ruchitaambre.altuscorp@gmail.com",
];

const PUBLISHERS_BY_NAME: readonly string[] = ["manan", "ruchita", "rutvisha"];

/** Dummy mode signs in as this account; it may publish so the screen is usable there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * May this person upload a policy, or remove one?
 *
 * `dummyMode` is passed by the caller from DUMMY_MODE, which is forced off in
 * production — so the dummy admin is admitted on port 3002 and nowhere else.
 */
export function canPublishPolicies(actor: PolicyActor, dummyMode = false): boolean {
  const email = norm(actor.email);
  if (dummyMode && email === DUMMY_EMAIL) return true;
  if (email && PUBLISHERS_BY_EMAIL.includes(email)) return true;
  const name = norm(actor.name);
  return name.length > 0 && PUBLISHERS_BY_NAME.some((n) => name.includes(n));
}
