import { and, eq, isNull } from "drizzle-orm";
import { removeAuthCookies } from "next-firebase-auth-edge/next/cookies";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { authSessions } from "@/db/schema";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { PROFILE_CACHE_TAGS } from "@/lib/cache-tags";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";

/**
 * Sign out — and actually KILL the session, not just drop the browser cookie.
 *
 * This is the single exit used by the user menu, the admin header AND the
 * 15-minute idle-timeout (idle-timer-client). Before clearing the cookie we:
 *   1. Revoke the user's Firebase refresh tokens. Without this the Firebase
 *      client still holds a valid refresh token and can silently mint a fresh
 *      idToken on the next page load → /api/auth/session inserts ANOTHER
 *      auth_sessions row → the "multiple sessions" pile-up. Revoking forces a
 *      real re-login; the session is gone for good ("killed permanently").
 *   2. Mark this user's live auth_sessions rows revoked so the session list in
 *      /profile reflects reality and no zombie rows linger.
 *
 * Both steps are best-effort: a failure here must never block the user from
 * signing out, so we always fall through to clearing the cookie.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentEmployee();
    if (me) {
      if (me.firebaseUid) {
        try {
          await getFirebaseAdminAuth().revokeRefreshTokens(me.firebaseUid);
        } catch (err) {
          console.warn("[signout] revokeRefreshTokens failed (non-fatal):", err);
        }
      }
      try {
        await db
          .update(authSessions)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(authSessions.employeeId, me.id), isNull(authSessions.revokedAt)),
          );
        revalidateTag(PROFILE_CACHE_TAGS.authSessions(me.id), "default");
      } catch (err) {
        console.warn("[signout] auth_sessions revoke failed (non-fatal):", err);
      }
    }
  } catch (err) {
    console.warn("[signout] session resolve failed (non-fatal):", err);
  }

  const res = removeAuthCookies(req.headers, {
    cookieName: "__session",
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.ALLOW_INSECURE_COOKIES !== "true",
      sameSite: "lax" as const,
      maxAge: 0,
    },
  });

  // Also clear the active-workspace cookie. IMPORTANT: append a raw Set-Cookie
  // rather than calling `res.cookies.set(...)` — the latter re-serialized the
  // response's cookie store and CLOBBERED removeAuthCookies' __session clearing,
  // so sign-out left the session intact and /login bounced the user back to the
  // app. An additive Set-Cookie header can't disturb the __session clear.
  res.headers.append(
    "Set-Cookie",
    `${ACTIVE_WORKSPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`,
  );
  return res;
}
