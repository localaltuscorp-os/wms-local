import { NextResponse, type NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge";

const PUBLIC_PATHS = [
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

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true;
  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return authMiddleware(request, {
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
      // No maxAge — session cookie. Browser clears on full close.
      // Paired with browserSessionPersistence in lib/firebase/client.ts.
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
      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async () => {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    },
    handleError: async (error) => {
      console.error("auth middleware error", error);
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xlsx)$).*)",
  ],
};
