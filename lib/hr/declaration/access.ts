/**
 * THE SIGNED DECLARATION — who may read a scan, and who may manage them.
 *
 * Every employee signs one declaration by hand; the scan of that sheet is filed
 * against them. Asked for 2026-09-21: it is readable by the PERSON THEMSELVES,
 * by Ruchita and by Rutvisha. Nobody else.
 *
 * ── BEING AN ADMIN IS NOT ENOUGH, AND NEITHER IS SUPER-ADMIN ──────────────
 * Both flags are held by more people than the two named here, and the point of
 * the rule is that this document has a named custodian. Note in particular that
 * MANAN IS DELIBERATELY ABSENT: the brief named three parties and he was not one
 * of them. The same shape as lib/hr/holiday-admins.ts, which also excludes him.
 * Adding him is one line in DECLARATION_ADMINS_BY_EMAIL, visible in review.
 *
 * ── MATCHED ON EMAIL, WITH A NAME FALLBACK ───────────────────────────────
 * Email is the identity a namesake cannot borrow, and `employees.email` is the
 * same value in local development and in production, where a uuid is not — a
 * stale uuid fails SILENTLY, leaving somebody quietly unable to open a file with
 * no error to explain why.
 *
 * 🔴 RUTVISHA'S ADDRESS IS LISTED BUT MATCHES NOBODY TODAY. Verified
 * 2026-09-21: there is no `employees` row for rutvishamehta.altuscorp@gmail.com
 * — she has no account to sign in with, and one cannot be created while the
 * Firebase service-account key is revoked. Her entry is kept here so her access
 * switches on by itself the moment that row exists, and the name fallback
 * admits her in the meantime if she is given an account under a different
 * address. Until then, "Ruchita and Rutvisha" is Ruchita alone — which also
 * means one person currently holds this, so do not treat it as a two-person
 * control yet.
 *
 * First names are matched as WHOLE WORDS, so "Rutvishaa" is not Rutvisha. That
 * is deliberately stricter than lib/hr/policies/access.ts, whose substring match
 * would admit either.
 *
 * ── PURE ─────────────────────────────────────────────────────────────────
 * No `server-only`, no I/O. Client components import these to HIDE controls, and
 * hiding a control is presentation, never authorization: every read and write
 * path calls the predicate again on the server (./guard.ts).
 */

export interface DeclarationActor {
  /** `employees.id` — needed only to answer "is this your own scan?". */
  id?: string | null;
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean | null;
}

/** The custodians of the signed declarations. */
export const DECLARATION_ADMINS_BY_EMAIL: readonly string[] = [
  "ruchitaambre.altuscorp@gmail.com", // Ruchita Ambre
  "rutvishamehta.altuscorp@gmail.com", // Rutvisha Mehta — no account yet, see above
];

/** First names, matched as whole words. */
const DECLARATION_ADMINS_BY_NAME: readonly string[] = ["ruchita", "rutvisha"];

/** Named in refusals and in the UI, so the two never drift apart. */
export const DECLARATION_ADMIN_NAMES = "Ruchita and Rutvisha";

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** Dummy mode signs in as this account; it may manage so the screen is usable there. */
const DUMMY_EMAIL = "dummy.admin@example.invalid";

/**
 * May this person see the whole tracker, and upload a scan against anybody?
 *
 * `dummyMode` is passed by the caller from DUMMY_MODE, which is forced off in
 * production — so the dummy admin is admitted on port 3002 and nowhere else.
 */
export function canManageDeclarations(actor: DeclarationActor, dummyMode = false): boolean {
  const email = norm(actor.email);
  if (dummyMode && email === DUMMY_EMAIL) return true;
  if (email && DECLARATION_ADMINS_BY_EMAIL.includes(email)) return true;
  const first = norm(actor.name).split(/\s+/)[0] ?? "";
  return first.length > 0 && DECLARATION_ADMINS_BY_NAME.includes(first);
}

/**
 * May this person open the signed scan filed against `employeeId`?
 *
 * The custodians, or the employee looking at their own. Fails CLOSED: an absent
 * actor id and an absent employee id must never compare equal, or everybody
 * would read everybody's.
 */
export function canReadDeclarationScan(
  actor: DeclarationActor,
  employeeId: string | null | undefined,
  dummyMode = false,
): boolean {
  if (canManageDeclarations(actor, dummyMode)) return true;
  const mine = norm(actor.id);
  const theirs = norm(employeeId);
  return mine.length > 0 && mine === theirs;
}

export const DECLARATION_REFUSAL = `Only ${DECLARATION_ADMIN_NAMES} can manage the signed declarations.`;
