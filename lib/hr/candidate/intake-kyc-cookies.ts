import "server-only";

/**
 * The two one-shot cookies that carry the DigiLocker intake round-trip.
 *
 * OUTBOUND (`hr_kyc_flow`) — set before redirecting to DigiLocker, read by the
 * callback. Carries the PKCE `code_verifier` (which must be presented again at
 * token exchange), the `state` we minted, and where to return the browser.
 * SameSite=Lax so it survives DigiLocker's top-level GET redirect back; HttpOnly
 * so the verifier never reaches page scripts.
 *
 * INBOUND (`hr_kyc_result`) — set by the callback, read ONCE by
 * /api/hr/aadhaar/digilocker/result and cleared on that read.
 *
 * ⚠ THE INBOUND COOKIE HOLDS PII (name, DOB, address) for the seconds between
 * the redirect landing and the form reading it. That is deliberate and bounded:
 * HttpOnly (never readable by scripts, including any injected one), SameSite=Lax,
 * a 120-second lifetime, and deleted the moment it is read. The alternative -
 * writing the demographics into the draft row server-side - would mean rebuilding
 * the form's section-prefixed key mapping outside the form, where it would drift
 * from it. Handing the fields to the client lets the existing `onFill` do the
 * mapping, with one copy of that logic.
 *
 * The Aadhaar NUMBER is never in either cookie; DigiLocker only ever returns it
 * masked to last-4, and we do not carry even that.
 */

export const KYC_FLOW_COOKIE = "hr_kyc_flow";
export const KYC_RESULT_COOKIE = "hr_kyc_result";

/** An OAuth round-trip is seconds; a stalled one should not linger. */
export const KYC_FLOW_MAX_AGE = 600; // 10 min - the user may pause at DigiLocker's consent screen
export const KYC_RESULT_MAX_AGE = 120; // 2 min - redirect lands, form reads it, done

export interface KycFlowCookie {
  state: string;
  verifier: string;
  /** Same-origin path to send the browser back to. */
  ret: string;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function serializeFlowCookie(v: KycFlowCookie): string {
  return encode(v);
}

export function parseFlowCookie(raw: string | null | undefined): KycFlowCookie | null {
  const v = decode<Partial<KycFlowCookie>>(raw);
  if (!v || typeof v.state !== "string" || typeof v.verifier !== "string") return null;
  if (!v.state || !v.verifier) return null;
  return { state: v.state, verifier: v.verifier, ret: typeof v.ret === "string" ? v.ret : "" };
}

export function serializeResultCookie(v: unknown): string {
  return encode(v);
}

export function parseResultCookie<T>(raw: string | null | undefined): T | null {
  return decode<T>(raw);
}

/** Secure everywhere it can be — never on plain-HTTP localhost, or the cookie
 *  is silently dropped and the round-trip fails with no visible cause. */
function secure(): boolean {
  return process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true";
}

/** `Set-Cookie` value for one of these, or its deletion when `maxAge` is 0. */
export function kycCookieHeader(name: string, value: string, maxAge: number): string {
  const bits = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure()) bits.push("Secure");
  return bits.join("; ");
}

export function clearKycCookie(name: string): string {
  return kycCookieHeader(name, "", 0);
}

/** Read one cookie out of a raw Cookie header — no next/headers dependency, so
 *  this works inside a plain Route Handler. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
