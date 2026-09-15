import "server-only";
import { cookies } from "next/headers";

/**
 * The access link's cookie — how a no-login candidate stays "signed in" for the
 * length of one visit.
 *
 * ── WHY A COOKIE AND NOT THE URL ───────────────────────────────────────────
 * The token appears in the address bar EXACTLY ONCE, when the emailed link is
 * opened. `/c/<token>` verifies it, drops it in here, and redirects to a clean
 * `/c/form`. After that the token is not in the URL, which matters more than it
 * looks:
 *   · it does not ride out in the `Referer` header to any third-party asset,
 *   · it is not in the browser history, the tab title, or a screenshot of the
 *     form — and these forms get filled on shared office machines,
 *   · it is not in any server access log that records request paths.
 *
 * HttpOnly, so page scripts cannot read it. SameSite=Lax rather than Strict: the
 * candidate arrives by clicking a link in their email client, which is a
 * cross-site top-level navigation — Strict would drop the cookie on exactly the
 * journey this exists for. Lax still blocks it on cross-site POSTs.
 *
 * Path-scoped to `/c`, so it is never attached to an employee request. A
 * candidate's browser that later signs in as a real user does not carry this
 * into the app.
 *
 * The cookie holds the OPAQUE TOKEN and nothing else — not the intake id, not
 * the expiry, not a name. Every fact is re-read from the database per request
 * (lib/hr/candidate/access-link.ts), so editing this cookie gets you nothing but
 * a failed lookup.
 */
export const CANDIDATE_LINK_COOKIE = "altus_cand_link";

/**
 * The cookie's attributes, in ONE place.
 *
 * Exported because the door that actually issues it is a Route Handler
 * (app/c/[token]/route.ts) which sets the cookie on its own redirect response —
 * a Server Component may not write cookies at all in Next 16. Two copies of
 * these attributes is two chances for the public one to quietly lose `httpOnly`.
 *
 * Mirrors the link's own TTL; the database row is still the authority, so an
 * early-expiring or hand-extended cookie changes nothing about access.
 */
export function candidateLinkCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // `ALLOW_INSECURE_COOKIES` is the repo-wide escape hatch for the TLS-less
    // local-server deploy (`pnpm start:lan`), and this cookie MUST honour it
    // like every other one does — the session cookie, proxy.ts, device-access,
    // the DigiLocker PKCE cookie and intake-kyc-cookies all pair the two.
    // Without it, a Secure cookie over plain HTTP is dropped by the browser in
    // silence: the candidate opens their link, is redirected to /c/form, lands
    // there with no cookie, and is bounced to /c/resume — which mails them
    // another link that fails in exactly the same way. A loop with no error
    // anywhere to diagnose it by.
    secure:
      process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
    path: "/c",
    expires: expiresAt,
  };
}

/** Set it from a Server Action (a Route Handler sets it on its own response). */
export async function setCandidateLinkCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(CANDIDATE_LINK_COOKIE, token, candidateLinkCookieOptions(expiresAt));
}

export async function readCandidateLinkCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CANDIDATE_LINK_COOKIE)?.value ?? null;
}

export async function clearCandidateLinkCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(CANDIDATE_LINK_COOKIE, "", { httpOnly: true, path: "/c", maxAge: 0 });
}
