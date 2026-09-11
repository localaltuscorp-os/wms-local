import { NextResponse, type NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { devAuthBypassEnabled } from "@/lib/auth/dev-bypass";

const PUBLIC_PATHS = [
  "/ctest",
  // Candidate no-login forms (migration 0221). `/c/<token>` lets someone who is
  // not an employee yet fill in their own details and sign the policies without
  // creating an account on os.altuscorp.in, and `/c/resume` mails them a fresh
  // link. Public HERE only in the sense that the cookie middleware must not
  // bounce them to /login — the pages themselves are NOT unguarded: every one of
  // them resolves the token through resolveAccessLink() and renders nothing
  // without a live, unrevoked, unexpired link. See lib/hr/candidate/access-link.ts.
  "/c",
  "/login",
  "/forgot-password",
  "/set-password",
  "/welcome",
  "/terms",
  "/privacy",
];

const PUBLIC_API = [
  "/api/auth/session",
  "/api/auth/signout",
  "/api/health",
  // Cron routes are authenticated by their own `Authorization: Bearer <CRON_SECRET>`
  // check inside the route handler (see e.g. app/api/cron/digest/route.ts).
  // Without this exclusion, the auth middleware redirects them to /login
  // before the route can verify CRON_SECRET — silently breaking every
  // Vercel cron invocation.
  "/api/cron/",
  // Native-app endpoints authenticate via `Authorization: Bearer <firebaseIdToken>`
  // inside the route (lib/auth/mobile.ts) — there's no session cookie, so the
  // cookie-based auth middleware must skip them or it 307s the app to /login.
  "/api/mobile/",
];

// PWA assets — must be reachable without auth so the browser can install
// the app and register the Service Worker before the user signs in.
const PUBLIC_FILES = ["/manifest.json", "/sw.js"];

/**
 * DEVELOPMENT ONLY — the fixture-data UI previews under `app/ui-preview/`.
 *
 * They exist so a layout can be looked at when the database is unreachable, and
 * the auth check itself is a database read, so they have to skip it. The list is
 * EMPTY in a production build: this cannot become a way in, because the route is
 * not public there and `app/ui-preview/*` calls `notFound()` as well.
 */
const DEV_PUBLIC_PATHS = process.env.NODE_ENV === "production" ? [] : ["/ui-preview"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true;
  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return true;
  return [...PUBLIC_PATHS, ...DEV_PUBLIC_PATHS].some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Redirect to /login while CLEARING the session cookie. A token that fails
 * verification/refresh (e.g. its refresh token was revoked on sign-out) must be
 * dropped here — otherwise the dead-but-decodable cookie keeps /login thinking
 * the user is signed in, and /login ⟷ app bounce forever. Clearing it lets the
 * loop self-heal: the next /login render sees no cookie and shows the form.
 */
function redirectClearingSession(url: URL): NextResponse {
  const res = NextResponse.redirect(url);
  res.cookies.set("__session", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_INSECURE_COOKIES !== "true",
  });
  return res;
}

/**
 * Local no-login mode — the inline twin of `localSessionEnabled()` in
 * lib/auth/local-session.ts. It is duplicated rather than imported because that
 * module is `server-only` and this file is the request interceptor; the two
 * MUST stay in lock-step.
 *
 * When on, the whole auth middleware is skipped and /login is folded into /hub.
 * The `VERCEL`/`VERCEL_ENV` guard, and the NODE_ENV floor beneath it, mean a
 * stray DISABLE_AUTH=true in a deployment's environment can never take the
 * login wall down - on Vercel or anywhere else.
 */
function localSessionEnabled(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DISABLE_AUTH === "true";
}

/**
 * Android mobile browsers are pushed to the native-app install screen (/get-app)
 * — we've retired the responsive web UI on Android in favour of the native app.
 * iOS + desktop are untouched. Detection requires a real browser UA (Mozilla +
 * Android + Mobile); the native app itself calls only /api/mobile/* over OkHttp
 * (UA "okhttp/…", no "Mozilla") so it never matches — and /api is excluded
 * regardless, so no app/data traffic is ever rewritten. Rewrite (not redirect)
 * keeps the typed URL and avoids history/loop churn.
 */
function isAndroidMobileBrowser(userAgent: string): boolean {
  return (
    /Mozilla/i.test(userAgent) &&
    /Android/i.test(userAgent) &&
    /Mobile/i.test(userAgent)
  );
}

// Next.js 16: the request-interception convention is `proxy.ts` exporting an
// async `proxy` (formerly `middleware.ts` / `middleware`). It runs on the
// Node.js runtime — REQUIRED by next-firebase-auth-edge ≥1.12 on Next 16: the
// legacy middleware/Edge path hands jose a raw key and throws
// "Key for the RS256 algorithm must be … Received an instance of Uint8Array".
export async function proxy(request: NextRequest) {
  // DEV_AUTH_BYPASS=true (.env.local, non-production only) — skip Firebase
  // session verification entirely. See lib/auth/dev-bypass.ts. Mirrors the
  // real handleValidToken branch below (same "/" → /hub redirect, same
  // x-pathname header) so the (app) layout behaves identically either way.
  if (devAuthBypassEnabled()) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/hub", request.url));
    }
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  }

  const pathname = request.nextUrl.pathname;
  if (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/get-app") &&
    !pathname.startsWith("/_next/") &&
    isAndroidMobileBrowser(request.headers.get("user-agent") ?? "")
  ) {
    return NextResponse.rewrite(new URL("/get-app", request.url));
  }

  // Local no-login mode: no cookie to verify, so hand every request straight
  // through with the identity headers the app layout expects, and send the two
  // "signed out" entry points (/ and /login) to the hub — the app starts there.
  if (localSessionEnabled()) {
    if (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/")) {
      return NextResponse.redirect(new URL("/hub", request.url));
    }
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }

  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // DUMMY MODE — every route is public. The cookie check below would redirect
  // to /login, and there is nothing to sign in to: Firebase is not contacted and
  // lib/auth/current.ts hands back the seeded dummy employee instead. Guarded on
  // NODE_ENV inside DUMMY_MODE, so a production build never takes this branch.
  //
  // It must still do the TWO things `handleValidToken` does below, because they
  // are not authentication — they are how the app knows where it is:
  //
  //   · `x-pathname`. Server Components cannot read the request path, so layouts
  //     read this header instead. Without it `workspaceForPath()` sees "/" and
  //     reports NO workspace, and `DashboardHeader` renders its retired
  //     horizontal header (it returns null only INSIDE a workspace) on top of
  //     the layout's own top bar — two stacked headers on every page. The
  //     workspace access checks and the daily-gate scoping read it too.
  //   · the "/" → /hub redirect, so the root lands somewhere real.
  if (DUMMY_MODE) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/hub", request.url));
    }
    const forwarded = new Headers(request.headers);
    forwarded.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: forwarded } });
  }

  // Self-heal a stale/garbage `__session` cookie. A legacy cookie signed with a
  // DIFFERENT algorithm (e.g. an old RS256-header token from a prior auth scheme)
  // makes next-firebase-auth-edge's HS256 custom-JWT verifier throw a hard
  // "RS256 … Received an instance of Uint8Array" — which its own handleError does
  // NOT catch, 500ing every request in a way the user can't escape (they can't
  // reach /login to sign out). Wrapping the whole call turns that dead-end into a
  // clean redirect-to-login that CLEARS the cookie, so the very next request is
  // cookie-free and the login form renders. Valid HS256 cookies never reach here.
  try {
    return await authMiddleware(request, {
    loginPath: "/api/auth/session",
    logoutPath: "/api/auth/signout",
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    cookieName: "__session",
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT!,
      process.env.COOKIE_SECRET_PREVIOUS!,
    ],
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      // Override with ALLOW_INSECURE_COOKIES=true for HTTP local-server deploys
      // (LAN-only Windows install on http://<ip>:3000 without TLS).
      secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
      sameSite: "lax" as const,
      // Persistent cookie (14 days) so users stay signed in across browser
      // restarts — the normal "remember me" behaviour. Paired with
      // browserLocalPersistence in lib/firebase/client.ts + the session-mint
      // route's matching maxAge. Refresh extends it on each authed request.
      maxAge: 14 * 24 * 60 * 60,
    },
    serviceAccount: {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    },
    // Verify token signatures locally using cached Google public keys
    // instead of calling Firebase per request. `checkRevoked: true` adds a
    // round-trip to Google on EVERY request (including RSC prefetches),
    // which on a remote DB region compounds with the DB latency on each
    // navigation. We trade that for slightly stale revocation: a forced
    // sign-out propagates on the next token refresh (max 1 hour) rather
    // than instantly. Signing-key rotation is still picked up live.
    checkRevoked: false,
    handleValidToken: async (_tokens, headers) => {
      // The app root is the HUB. Send authed users hitting "/" straight to
      // /hub (the WMS dashboard lives at /dashboard now) — before the (app)
      // layout even runs.
      if (request.nextUrl.pathname === "/") {
        return NextResponse.redirect(new URL("/hub", request.url));
      }
      // Expose the current path to Server Components (layouts can't read it).
      // The (app) layout uses this to scope the WMS-only daily-loop gates.
      headers.set("x-pathname", request.nextUrl.pathname);
      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async () => {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", request.nextUrl.pathname);
      return redirectClearingSession(url);
    },
    handleError: async (error) => {
      console.error("auth middleware error", error);
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectClearingSession(url);
    },
    });
  } catch (err) {
    // A throw that escaped handleError (e.g. the stale-cookie RS256 crypto crash).
    // Clear the offending cookie and bounce to /login so the app self-heals.
    console.error("auth proxy fatal — clearing session cookie", err);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectClearingSession(url);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xlsx|woff2|woff|ttf|otf|css)$).*)",
  ],
};
