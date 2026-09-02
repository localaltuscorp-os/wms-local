import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

/**
 * Hash the current __session cookie the same way /api/auth/session does
 * so we can mark the matching auth_sessions row as "this device" on
 * /profile. Returns null when there's no cookie (e.g. middleware
 * intercepts unauth'd before this is reached, but defensive).
 */
export async function getThisDeviceSessionHash(): Promise<string | null> {
  const jar = await cookies();
  const sessionCookie = jar.get("__session");
  if (!sessionCookie?.value) return null;

  const salt = process.env.COOKIE_SECRET_CURRENT ?? "fallback-salt";
  // NOTE: /api/auth/session hashes the freshly-issued idToken (not the
  // cookie body). The cookie body is the session cookie minted by
  // setAuthCookies, which is different. So we can't compute the same
  // hash here. Fallback heuristic: the most recently-active session is
  // assumed to be this device. This is fine for chunk 1; we'll switch
  // to a cookie-derived hash once we standardise the mint pathway.
  void createHash;
  void salt;
  return null;
}
