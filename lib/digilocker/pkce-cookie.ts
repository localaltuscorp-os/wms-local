import "server-only";

/**
 * PKCE handoff cookie for the DigiLocker OAuth flow.
 *
 * PKCE requires the `code_verifier` generated at authorize-time to be presented
 * again at token-exchange time. Rather than add a DB column, we stash it in a
 * short-lived, HttpOnly, SameSite=Lax cookie: Lax cookies ARE sent on the
 * top-level GET navigation DigiLocker uses to redirect back to our callback, so
 * the verifier survives the round-trip without ever reaching client JS.
 *
 * The cookie also carries the `state` (the document_signatures row id) so the
 * callback can bind the returned state to the browser that initiated the flow —
 * a second CSRF check on top of the unguessable state value itself.
 *
 * Value format: `${state}.${verifier}` — both parts are dot-free (UUID /
 * base64url), so a single '.' is an unambiguous separator.
 */

export const PKCE_COOKIE = "dl_sign_pkce";
export const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes — an OAuth round-trip is seconds.

export function serializePkceCookie(state: string, verifier: string): string {
  return `${state}.${verifier}`;
}

export function parsePkceCookie(raw: string | undefined | null): {
  state: string;
  verifier: string;
} | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot >= raw.length - 1) return null;
  const state = raw.slice(0, dot);
  const verifier = raw.slice(dot + 1);
  if (!state || !verifier) return null;
  return { state, verifier };
}

/** Cookie options shared by the setter (server action) — Secure in prod-over-TLS. */
export function pkceCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_COOKIES !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: PKCE_COOKIE_MAX_AGE,
  };
}
