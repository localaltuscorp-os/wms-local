/**
 * The "2-step done for today" pass — a signed cookie, readable on the edge.
 *
 * After someone enters the emailed code, this browser gets a pass that is good
 * until the NEXT MIDNIGHT IN INDIA, not for 24 hours. Verify at 9 am or at
 * 11:55 pm, the next code is asked for the next calendar day either way. That
 * is the requirement as agreed with Rohan: "once a day", where a day is the
 * office's day.
 *
 * WHY A SIGNED COOKIE AND NOT A DATABASE LOOKUP: proxy.ts checks this on every
 * request, including prefetches. A database round trip there would add latency
 * to every navigation and turn a slow database into a company-wide lockout. The
 * pass is HMAC-signed with the same COOKIE_SECRET_* the session uses, so it
 * cannot be forged or edited, and it names the Firebase uid it was issued to, so
 * one person's pass is worthless next to someone else's session.
 *
 * Web Crypto only (no node:crypto): the middleware may run on the edge.
 */

export const TWO_STEP_PASS_COOKIE = "altus_2sv";

/** IST is UTC+05:30 all year — India has no daylight saving. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Two-step verification is ON unless TWO_STEP_VERIFICATION=off. The switch
 * exists for one situation: email delivery is down and nobody can sign in. It
 * is not a per-person exemption.
 */
export function twoStepEnabled(): boolean {
  return (process.env.TWO_STEP_VERIFICATION ?? "").trim().toLowerCase() !== "off";
}

/** The first instant of the next calendar day in India, after `now`. */
export function nextMidnightIst(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const nextIstDayUtcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return new Date(nextIstDayUtcMidnight - IST_OFFSET_MS);
}

function base64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function signingSecrets(): string[] {
  return [process.env.COOKIE_SECRET_CURRENT, process.env.COOKIE_SECRET_PREVIOUS].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

/** Constant-time string compare, so a signature cannot be guessed byte by byte. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Build the pass for `uid`, valid until the next midnight IST. Returns the
 * cookie value and its expiry; the caller writes the Set-Cookie header.
 */
export async function createTwoStepPass(
  uid: string,
  verificationId: string,
  now: Date = new Date(),
): Promise<{ value: string; expiresAt: Date }> {
  const [secret] = signingSecrets();
  if (!secret) throw new Error("COOKIE_SECRET_CURRENT is not set");
  const expiresAt = nextMidnightIst(now);
  const body = `v1.${uid}.${Math.floor(expiresAt.getTime() / 1000)}.${verificationId}`;
  return { value: `${body}.${await hmac(secret, body)}`, expiresAt };
}

/**
 * True when `value` is an unexpired, correctly signed pass issued to `uid`.
 * Accepts a pass signed with the PREVIOUS secret too, so rotating the secret
 * does not force everyone through a second code the same day.
 */
export async function isValidTwoStepPass(
  value: string | undefined | null,
  uid: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!value || !uid) return false;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return false;
  const [, passUid, expRaw, , sig] = parts;
  if (passUid !== uid || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 <= now.getTime()) return false;
  const body = parts.slice(0, 4).join(".");
  for (const secret of signingSecrets()) {
    if (sameString(sig, await hmac(secret, body))) return true;
  }
  return false;
}

/** The Set-Cookie header for a pass. Expires at the pass's own midnight. */
export function twoStepPassSetCookie(value: string, expiresAt: Date, now: Date = new Date()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const secure =
    process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true";
  return `${TWO_STEP_PASS_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
