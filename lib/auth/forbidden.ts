/**
 * THE 403 MARKER — shared by the server guards that raise a refusal and the
 * client error boundaries that have to recognise one.
 *
 * ── WHY ITS OWN FILE ───────────────────────────────────────────────────────
 * `lib/auth/current.ts` is `server-only`, and both error boundaries are client
 * components. Without a module they can both import, the boundary is forced to
 * hard-code the marker, which is precisely how it drifts from the guard that
 * raises it. No I/O here, no `server-only` — safe on both sides.
 *
 * ── WHY A DIGEST AND NOT THE MESSAGE ───────────────────────────────────────
 * The boundaries used to branch on `error.message === "Forbidden"`. That works
 * in development and silently stops working in production: Next redacts
 * server-component error messages before they reach the browser, by design, so
 * server internals never leak. The comparison therefore never matched in prod
 * and every permission refusal fell through to the generic retry card — the one
 * that says "usually the database being slow for a moment".
 *
 * That is a lie with a cost. It sends whoever hit it hunting a database fault
 * that does not exist; on 2026-08-27 a Registered Devices page that was merely
 * refusing an unlisted account was investigated as a schema problem.
 *
 * `digest` is the one field Next deliberately forwards to the client for this
 * purpose, and it keeps a digest already present on the error instead of
 * replacing it — so the marker survives where the message does not.
 */

/** Stamped onto every refusal raised by the require* guards. */
export const FORBIDDEN_DIGEST = "ALTUS_FORBIDDEN";

/**
 * True for a permission refusal.
 *
 * Checks the digest FIRST, then falls back to the message. The fallback is not
 * redundant: it still catches the handful of call sites that throw a bare
 * `Error("Forbidden")` of their own, and it keeps working in development where
 * the message arrives intact.
 */
export function isForbiddenError(e: { message?: string; digest?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.digest === FORBIDDEN_DIGEST || e.message === "Forbidden";
}
