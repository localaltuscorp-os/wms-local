import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
  clearFailedAttempts,
  getLockoutState,
  ipFailureCount,
  recordFailedAttempt,
} from "@/lib/auth/account-lockout";
import { LOCKED_MESSAGE, wrongPasswordMessage } from "@/lib/auth/lockout-copy";
import { mintSessionForIdToken } from "@/lib/auth/session-mint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email + password sign-in, checked ON THE SERVER.
 *
 * ── WHY THE SERVER ─────────────────────────────────────────────────────────
 * Sign-in used to run in the browser (`signInWithEmailAndPassword`), so a wrong
 * password never reached us and there was nothing to count. Reporting failures
 * from the browser would only count honest people: the Firebase web API key
 * ships in the page, so anyone who would rather not be counted calls Firebase
 * directly. A counter the subject can decline to increment is not a control.
 *
 * So the credential exchange happens here, against Firebase's REST endpoint,
 * and every refusal is counted (lib/auth/account-lockout.ts). Five consecutive
 * wrong passwords lock the address until one of the four unlockers releases it.
 *
 * ── THE BROWSER STILL GETS A FIREBASE SESSION ──────────────────────────────
 * Sign-out, the idle timer and "change password" all use the client SDK's
 * session. Rather than send the password to Firebase twice, a successful login
 * returns a one-time CUSTOM TOKEN, which the form exchanges for that session.
 * The password never reaches the browser's Firebase call at all.
 *
 * A locked account is refused BEFORE the password is checked, so a correct
 * password on a locked account cannot reveal itself through timing.
 */

/** Failures from one address in the current hour before it is refused outright. */
const MAX_IP_FAILURES_PER_HOUR = 40;

/** Matches the other IP readers in the app: first hop of x-forwarded-for. */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip")?.trim() || null;
}

const CREDENTIAL_REFUSALS = [
  "INVALID_PASSWORD",
  "EMAIL_NOT_FOUND",
  "INVALID_LOGIN_CREDENTIALS",
  "MISSING_PASSWORD",
  "INVALID_EMAIL",
];

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json", message: "Something went wrong. Try again." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "missing-fields", message: "Enter your email and password." },
      { status: 400 },
    );
  }
  // Long-password guard, mirroring the form: refuse before any auth work.
  if (password.length > 128) {
    return NextResponse.json(
      { error: "password-too-long", message: "That password is too long (max 128 characters)." },
      { status: 400 },
    );
  }

  const ip = clientIp(req);
  if (ip) {
    try {
      if ((await ipFailureCount(ip)) >= MAX_IP_FAILURES_PER_HOUR) {
        return NextResponse.json(
          {
            error: "ip-throttled",
            message: "Too many failed sign-ins from this network. Wait an hour, or ask an admin for help.",
          },
          { status: 429 },
        );
      }
    } catch (err) {
      // The throttle is a courtesy, not the control. A database hiccup must not
      // stop the company signing in.
      console.error("[auth/login] ip throttle check failed — continuing", err);
    }
  }

  // Locked? Refuse without asking Firebase anything.
  try {
    const state = await getLockoutState(email);
    if (state.locked) {
      return NextResponse.json({ error: "account-locked", message: LOCKED_MESSAGE }, { status: 423 });
    }
  } catch (err) {
    // Fail OPEN on an infrastructure error: a broken lockout table must not
    // become a company-wide outage. The counter resumes when the database does.
    console.error("[auth/login] lockout lookup failed — allowing the attempt", err);
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("[auth/login] NEXT_PUBLIC_FIREBASE_API_KEY is not set");
    return NextResponse.json(
      { error: "not-configured", message: "Sign-in is not configured on this server." },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
  } catch (err) {
    console.error("[auth/login] Firebase unreachable", err);
    return NextResponse.json(
      { error: "upstream", message: "Couldn't reach the sign-in service. Check your connection and try again." },
      { status: 502 },
    );
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    idToken?: string;
    localId?: string;
    error?: { message?: string };
  };

  if (!upstream.ok) {
    const code = data.error?.message ?? "";
    if (code.startsWith("TOO_MANY_ATTEMPTS_TRY_LATER")) {
      return NextResponse.json(
        { error: "too-many-requests", message: "Too many attempts in a row — give it a minute, then try again." },
        { status: 429 },
      );
    }
    if (code === "USER_DISABLED") {
      return NextResponse.json(
        {
          error: "disabled",
          message: "This account has been deactivated. Reach out to your admin to reinstate access.",
        },
        { status: 403 },
      );
    }
    if (CREDENTIAL_REFUSALS.some((c) => code.startsWith(c))) {
      // Counted even when the address has no account: the attempts most worth
      // counting are the ones against addresses that do not exist.
      let after;
      try {
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.email, email))
          .limit(1);
        after = await recordFailedAttempt(email, { ip, employeeId: emp?.id ?? null });
      } catch (err) {
        // Log the DATABASE's own message, not just drizzle's wrapper: "Failed
        // query: insert into …" says nothing about why, and this counter is the
        // whole control — a silent failure here means nobody is being counted.
        const cause = (err as { cause?: { message?: string; code?: string; detail?: string } }).cause;
        console.error(
          "[auth/login] could not record the failed attempt:",
          cause?.code ?? "",
          cause?.message ?? (err as Error)?.message,
          cause?.detail ?? "",
        );
        return NextResponse.json(
          { error: "bad-credentials", message: "Email or password didn't match. Try again." },
          { status: 401 },
        );
      }
      return NextResponse.json(
        {
          error: after.locked ? "account-locked" : "bad-credentials",
          remaining: after.remaining,
          message: after.locked ? LOCKED_MESSAGE : wrongPasswordMessage(after.remaining),
        },
        { status: after.locked ? 423 : 401 },
      );
    }
    console.error("[auth/login] unexpected Firebase refusal", upstream.status, code);
    return NextResponse.json(
      { error: "upstream", message: "Sign-in is having trouble right now. Try again in a minute." },
      { status: 502 },
    );
  }

  if (!data.idToken) {
    console.error("[auth/login] Firebase accepted the password but returned no token");
    return NextResponse.json(
      { error: "upstream", message: "Sign-in is having trouble right now. Try again in a minute." },
      { status: 502 },
    );
  }

  // The password was right: the streak is over, whatever it was.
  try {
    await clearFailedAttempts(email);
  } catch (err) {
    console.error("[auth/login] could not clear the failed-attempt count", err);
  }

  // Same cookies as every other sign-in path.
  const minted = await mintSessionForIdToken(req, data.idToken);
  if (!minted.ok) return minted; // not-enrolled / device-not-authorized / bad token

  // One-time token so the browser's Firebase SDK is signed in too, without the
  // password. If it cannot be minted the person is still signed in to the app —
  // only the client-SDK features (sign-out, change password) would need a
  // reload — so this never fails the login.
  let customToken: string | null = null;
  try {
    customToken = await getFirebaseAdminAuth().createCustomToken(String(data.localId ?? ""));
  } catch (err) {
    console.error("[auth/login] createCustomToken failed", err);
  }

  const res = NextResponse.json({ ok: true, customToken });
  for (const cookie of minted.headers.getSetCookie()) {
    res.headers.append("Set-Cookie", cookie);
  }
  return res;
}
