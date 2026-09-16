/**
 * Super-admins are the only people allowed to change an employee's admin
 * status (promote normal→admin, demote admin→normal, or create an admin).
 * Every other admin keeps all other capabilities. This list is the single
 * source of truth; the server guards in the employees actions enforce it and
 * the UI hides the admin toggle for non-super-admins.
 */
export const SUPER_ADMIN_EMAILS = [
  // 2026-09-04 — reduced to a SINGLE super-admin during the unauthorized-access
  // incident (see HANDOFF.md). Removed in this change:
  //   • manan@unleashed.in            — the identity every unauthorized write
  //                                     resolved to; account is is_active=false
  //   • omjadhav.altuscorp@gmail.com  — is_active=false
  //   • mohitgupta.altuscorp@gmail.com
  //   • system.service.altus@gmail.com — a hardcoded super-admin for an address
  //     with NO employees row and NO Firebase account. Anyone able to insert an
  //     employees row with that email would have silently held super-admin, and
  //     no admin UI lists it. Removed as latent persistence, not because it was
  //     used. Re-add deliberately if some automation genuinely needs it.
  //
  // Addresses are app logins from `employees.email`, lowercase — a
  // correspondence address grants nothing.
  "rohanchoudhary.altuscorp@gmail.com",
  // 2026-09-04 (later same day) — Manan restored to super-admin at the account
  // holder's explicit instruction. NOTE: every unauthorized write during the
  // incident resolved to this identity, and HANDOFF.md asks that it not be
  // re-enabled until he confirms what happened. His Firebase account was
  // recreated with NO password, so he must complete an email reset to sign in.
  "manan@unleashed.in",
] as const;

/**
 * LOCAL DEVELOPMENT ONLY — super-admin on a dev machine, never on a deployment.
 *
 * 2026-09-12: added so the local no-login session (DISABLE_AUTH, see
 * lib/auth/local-session.ts) opens the super-admin surfaces — CTC on Employee
 * Master, the admin toggle, the pay columns — without promoting anyone on the
 * real deployment.
 *
 * ── WHY THIS IS A HARDCODED LIST AND NOT AN ENV VAR ────────────────────────
 * Because the env-var version of exactly this idea was REMOVED on 2026-09-04
 * (the note below). An env var meant anyone who could set one on Vercel could
 * silently grant themselves the highest privilege in the app, with nothing in
 * code review or git history to show for it. This list has the opposite
 * property: a name appears here only in a diff, and it is inert off a dev
 * machine regardless.
 *
 * ── WHY `NODE_ENV` AND NOT `VERCEL` / `DISABLE_AUTH` ───────────────────────
 * `process.env.NODE_ENV` is the only one of the three that is statically
 * inlined by the bundler on BOTH sides. `isSuperAdmin` is called from five
 * client components as well as the server, and a check the server can read but
 * the browser cannot would resolve differently in each — a hydration mismatch,
 * and a UI that disagrees with the guard behind it. Inlined, the whole branch
 * is dead code eliminated from a production build: `next build` sets
 * NODE_ENV=production, so no deployment — Vercel or otherwise — can reach it.
 *
 * Note this means `pnpm build && pnpm start` on this same machine does NOT
 * grant it either. That is correct: the grant is for `next dev`, not for any
 * production artifact, wherever it happens to run.
 */
const LOCAL_DEV_SUPER_ADMINS = [
  "vinalpatil.altuscorp@gmail.com",
] as const;

/**
 * NOTE: the previous `SYSTEM_SERVICE_EMAIL` env-var escape hatch was removed in
 * the same 2026-09-04 change. It let any address named in that variable gain
 * super-admin without a code change or review — i.e. anyone who could set a
 * Vercel env var could grant themselves the highest privilege in the app
 * silently. The variable was not set in production when it was removed, so this
 * is not a behaviour change today. Grant super-admin by editing the list above,
 * where it is visible in code review and in git history.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.includes(e as (typeof SUPER_ADMIN_EMAILS)[number])) return true;
  if (
    process.env.NODE_ENV !== "production" &&
    LOCAL_DEV_SUPER_ADMINS.includes(e as (typeof LOCAL_DEV_SUPER_ADMINS)[number])
  ) {
    return true;
  }
  return false;
}

// Who may change a task's DOER lives in lib/auth/doer-permission.ts, not here.
// It briefly lived in this file as a Manan-only email test; the rule is now
// "every manager, plus Manan and Om", which needs the org chart and so cannot
// be a pure email check. The old helper was removed rather than left in place,
// because an exported `canChangeDoer` still implementing the narrower rule is
// exactly the kind of thing a future caller imports by name and trusts.
