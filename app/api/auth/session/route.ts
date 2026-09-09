import { NextResponse } from "next/server";
import { setAuthCookies } from "next-firebase-auth-edge/next/cookies";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { isLoginLive } from "@/lib/auth/current";
import {
  adoptDeviceOnLogin,
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/security/device-access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

export const runtime = "nodejs";

// 14 days — users stay signed in across browser restarts (matches the
// middleware cookie maxAge + browserLocalPersistence on the client).
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/**
 * Sign-in session mint — kept deliberately SIMPLE: verify the Firebase ID token,
 * confirm it belongs to an active employee, mint the session cookie. No session
 * / device tracking, no extra writes on the critical path — login stays fast and
 * resilient even under DB load.
 */
export async function POST(req: Request) {
  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { idToken } = body;
  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  // Verify the ID token ourselves so we can (1) confirm the email belongs to an
  // active employee BEFORE issuing the session cookie, and (2) reconcile the
  // employees.firebase_uid column when an existing employee signs in through a
  // different provider (e.g. Google after originally being invited with a
  // password). setAuthCookies will verify the token a second time when it mints
  // the cookie; the extra verify on sign-in is acceptable.
  let decoded;
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch (err) {
    console.error("verifyIdToken failed", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = decoded.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Token has no email claim" }, { status: 400 });
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.email, email),
  });
  if (!emp || !isLoginLive(emp)) {
    // A candidate guest-account mints a cookie only while candidate_active; a
    // deactivated candidate (or inactive employee) is refused here.
    return NextResponse.json({ error: "not-enrolled" }, { status: 403 });
  }

  // Link / refresh the firebase_uid so getCurrentEmployee()'s UID-based lookup
  // resolves regardless of which provider the user signed in through. Also clear
  // any admin-reset lockout marker, and stamp joinedAt on first-ever sign-in.
  // These fire only on first login / provider change — never on the steady-state
  // login, so they add no per-login DB write in practice.
  const needsUidLink = emp.firebaseUid !== decoded.uid;
  const needsMarkerClear = emp.passwordResetByAdminAt !== null;
  const needsJoinedStamp = emp.joinedAt === null;
  if (needsUidLink || needsMarkerClear || needsJoinedStamp) {
    await db
      .update(employees)
      .set({
        ...(needsUidLink ? { firebaseUid: decoded.uid } : {}),
        ...(needsMarkerClear ? { passwordResetByAdminAt: null } : {}),
        ...(needsJoinedStamp ? { joinedAt: new Date() } : {}),
      })
      .where(eq(employees.id, emp.id));
  }

  // ── DEVICE ACCESS ────────────────────────────────────────────────────────
  //
  // Resolve (and on a first sign-in, adopt) the browser this login came from.
  // THIS IS THE ONLY PLACE the device cookie is minted: Next permits setting a
  // cookie in a Route Handler, and a Server Component — where the gate itself
  // runs — cannot. Doing it at sign-in means every authenticated request that
  // follows can simply READ the cookie.
  //
  // A refusal is returned BEFORE the session cookie is minted, deliberately.
  // Issuing a session and then blocking every page would leave the person
  // signed in to an application they cannot use, and would hand an unregistered
  // device a valid session cookie — which is exactly the thing the whole
  // feature is trying not to do. `deviceStatus` lets /login show the right
  // message instead of a generic failure.
  //
  // FAIL-OPEN ON AN INFRASTRUCTURE ERROR, not on a verdict: if the device
  // lookup THROWS (database unreachable), sign-in proceeds, because a database
  // hiccup must not lock the entire company out of the WMS. A device that is
  // successfully checked and refused is still refused.
  let deviceCookieId: string | null = null;
  if (!DUMMY_MODE) {
    try {
      const device = await adoptDeviceOnLogin(emp);
      if (!device.ok) {
        return NextResponse.json(
          { error: "device-not-authorized", deviceStatus: device.reason, message: device.error },
          { status: 403 },
        );
      }
      deviceCookieId = device.deviceId;
    } catch (err) {
      console.error("device adoption failed — allowing sign-in", err);
    }
  }

  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("Authorization", `Bearer ${idToken}`);

  try {
    const res = await setAuthCookies(forwardedHeaders, {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      cookieName: "__session",
      cookieSignatureKeys: [
        process.env.COOKIE_SECRET_CURRENT!,
        process.env.COOKIE_SECRET_PREVIOUS!,
      ],
      cookieSerializeOptions: {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
        sameSite: "lax" as const,
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
      serviceAccount: {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      },
    });

    // Set the device cookie on the response we ACTUALLY return. `adoptDeviceOnLogin`
    // already set it through `cookies()`, but `setAuthCookies` constructs its own
    // NextResponse, and trusting Next to merge a cookie mutation into a response
    // object a library built is the kind of assumption that works until it quietly
    // does not — and if this cookie is dropped, the next request is "unidentified"
    // and the person is bounced to /device-blocked one redirect after signing in.
    if (deviceCookieId) {
      res.cookies.set(DEVICE_COOKIE, deviceCookieId, {
        httpOnly: true,
        sameSite: "lax",
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.ALLOW_INSECURE_COOKIES !== "true",
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return res;
  } catch (err) {
    console.error("setAuthCookies failed", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
