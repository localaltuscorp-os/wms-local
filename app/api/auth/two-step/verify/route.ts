import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { isLoginLive } from "@/lib/auth/current";
import { isAccountLocked } from "@/lib/auth/account-lockout";
import { LOCKED_MESSAGE } from "@/lib/auth/lockout-copy";
import { mintSessionForIdToken } from "@/lib/auth/session-mint";
import { recordTwoStepVerification, requestMeta, verifyTwoStepCode } from "@/lib/auth/two-step";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step two of sign-in: the emailed code.
 *
 * The browser sends back the opaque `challenge` handle it got from step one
 * plus the 6 digits. The password is NOT sent again and the browser holds no
 * Firebase token between the steps — the handle alone ties the code to the
 * person, and it is useless without the code from their inbox.
 *
 * On success the server signs the person in to Firebase itself (custom token →
 * ID token) and mints the session through the same shared function as every
 * other sign-in, this time with the pass cookie that lasts until midnight IST.
 */
export async function POST(req: Request) {
  let body: { challenge?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json", message: "Something went wrong. Try again." }, { status: 400 });
  }
  const challenge = typeof body.challenge === "string" ? body.challenge : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";

  const checked = await verifyTwoStepCode(challenge, code);
  if (!checked.ok) {
    return NextResponse.json(checked, { status: checked.error === "code-expired" ? 410 : 401 });
  }

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, checked.employeeId) });
  if (!emp || !isLoginLive(emp) || !emp.firebaseUid) {
    return NextResponse.json({ error: "not-enrolled", message: "This account can't sign in." }, { status: 403 });
  }
  // Locked between the two steps: a lock placed now must bite now.
  try {
    if (await isAccountLocked(emp.email)) {
      return NextResponse.json({ error: "account-locked", message: LOCKED_MESSAGE }, { status: 423 });
    }
  } catch (err) {
    console.error("[two-step/verify] lockout lookup failed — continuing", err);
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not-configured", message: "Sign-in is not configured on this server." }, { status: 500 });
  }

  const verification = await recordTwoStepVerification({
    employeeId: emp.id,
    email: emp.email,
    challengeId: checked.challengeId,
    meta: requestMeta(req),
  });

  let idToken: string | undefined;
  let customToken: string | null = null;
  try {
    customToken = await getFirebaseAdminAuth().createCustomToken(emp.firebaseUid);
    const exchanged = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const data = (await exchanged.json().catch(() => ({}))) as { idToken?: string };
    idToken = data.idToken;
  } catch (err) {
    console.error("[two-step/verify] could not exchange a custom token", err);
  }
  if (!idToken) {
    return NextResponse.json(
      { error: "upstream", message: "Sign-in is having trouble right now. Try again in a minute." },
      { status: 502 },
    );
  }

  const minted = await mintSessionForIdToken(req, idToken, {
    twoStepVerification: { id: verification.id },
  });
  if (!minted.ok) return minted; // device refusal and the like

  // The browser's Firebase SDK signs in with the custom token (sign-out, the
  // idle timer and change-password use it). Custom tokens are good for an hour.
  const res = NextResponse.json({ ok: true, customToken });
  for (const cookie of minted.headers.getSetCookie()) res.headers.append("Set-Cookie", cookie);
  return res;
}
