import { NextResponse } from "next/server";
import { setAuthCookies } from "next-firebase-auth-edge/next/cookies";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authSessions, employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { updateTag } from "next/cache";
import { PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

export const runtime = "nodejs";

/**
 * Hash a value (typically the new __session cookie body) with an env
 * salt so the DB never sees the raw cookie. Same input → same hash, so
 * we can dedup re-mints on the same browser.
 */
function shortHash(input: string): string {
  const salt = process.env.COOKIE_SECRET_CURRENT ?? "fallback-salt";
  return createHash("sha256").update(`${salt}:${input}`).digest("hex").slice(0, 64);
}

const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

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
  // password). setAuthCookies will verify the token a second time when it
  // mints the cookie; the extra verify on sign-in is acceptable.
  let decoded;
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch (err) {
    console.error("verifyIdToken failed", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const email = decoded.email?.toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Token has no email claim" },
      { status: 400 },
    );
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.email, email),
  });
  if (!emp || !emp.isActive) {
    return NextResponse.json(
      { error: "not-enrolled" },
      { status: 403 },
    );
  }

  // Link / refresh the firebase_uid so getCurrentEmployee()'s UID-based lookup
  // resolves regardless of which provider the user signed in through. Also
  // clear any admin-reset lockout marker — a successful sign-in means the
  // employee is back in, so the "changed by admin" message must stop showing.
  const needsUidLink = emp.firebaseUid !== decoded.uid;
  const needsMarkerClear = emp.passwordResetByAdminAt !== null;
  // First-ever sign-in: stamp joinedAt so the admin "Invited/Joined" pill and
  // the pending-invites count stay accurate. This used to be done by the
  // /welcome interstitial (now removed) — the session mint is the canonical
  // "first time in the app" moment and runs on every login.
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

  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set("Authorization", `Bearer ${idToken}`);

  // Profile v2 — track this session so the user can list + revoke from
  // /profile#identity. Fire-and-forget; a write failure here is logged
  // but doesn't block sign-in.
  try {
    const sessionHash = shortHash(idToken);
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const fwdFor = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwdFor.split(",")[0]?.trim() ?? "";
    const ipHash = ip ? shortHash(`ip:${ip}`).slice(0, 32) : null;

    await db
      .insert(authSessions)
      .values({
        employeeId: emp.id,
        firebaseUid: decoded.uid,
        sessionHash,
        userAgent: ua,
        ipHash,
      })
      .onConflictDoUpdate({
        target: authSessions.sessionHash,
        set: { lastSeenAt: new Date(), revokedAt: null },
      });
    updateTag(PROFILE_CACHE_TAGS.authSessions(emp.id));
  } catch (err) {
    console.warn("[session] auth_sessions insert failed (non-fatal):", err);
  }

  try {
    return await setAuthCookies(forwardedHeaders, {
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
  } catch (err) {
    console.error("setAuthCookies failed", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
