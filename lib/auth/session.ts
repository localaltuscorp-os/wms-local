import "server-only";
import { cookies } from "next/headers";
import { getTokens } from "next-firebase-auth-edge/next/tokens";
import type { DecodedIdToken } from "next-firebase-auth-edge/auth";

/**
 * Reads + verifies the __session cookie issued by `setAuthCookies` in
 * /api/auth/session.  Returns the decoded Firebase claims (uid, email, ...)
 * or null if the cookie is absent / invalid / expired.
 *
 * Verification is signature-based against `cookieSignatureKeys` (HS256) — the
 * cookie is a JWT signed by this app, not a Firebase session cookie.  The
 * middleware uses the same keys, so any cookie middleware accepts is also
 * accepted here.
 */
export async function readSession(): Promise<DecodedIdToken | null> {
  try {
    const tokens = await getTokens(await cookies(), {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      cookieName: "__session",
      cookieSignatureKeys: [
        process.env.COOKIE_SECRET_CURRENT!,
        process.env.COOKIE_SECRET_PREVIOUS!,
      ],
      serviceAccount: {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      },
    });
    return tokens?.decodedToken ?? null;
  } catch (err) {
    // A malformed / stale / wrong-algorithm cookie (e.g. a legacy RS256-header
    // token) makes getTokens throw at the crypto layer. Treat any verification
    // failure as "signed out" rather than surfacing a runtime error in a Server
    // Component — requireUser() then cleanly redirects to /login (where the proxy
    // clears the bad cookie).
    console.error("readSession: token verification failed, treating as signed-out", err);
    return null;
  }
}
