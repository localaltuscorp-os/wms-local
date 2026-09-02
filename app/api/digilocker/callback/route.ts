import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentSignatures } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import {
  isDigiLockerConfigured,
  isPkceEnabled,
  exchangeCodeForKyc,
} from "@/lib/digilocker/config";
import { PKCE_COOKIE, parsePkceCookie } from "@/lib/digilocker/pkce-cookie";

/**
 * GET /api/digilocker/callback — DigiLocker OAuth2 redirect target.
 *
 * DigiLocker sends the signer's browser back here with `?code` + `?state`, where
 * `state` is the document_signatures row id (set by startSignature). We exchange
 * the code for the VERIFIED e-KYC (name/DOB/gender/address + MASKED Aadhaar +
 * photo + provider ref), stamp it onto the row, flip status → 'verified', and
 * redirect the signer back to the signing page to draw/type their signature.
 *
 * ⚠ AADHAAR ACT: exchangeCodeForKyc() already masks the Aadhaar to last-4 — no
 * full 12-digit value is ever received, stored, or logged here. The photo is
 * uploaded to the private `documents` bucket; only its path is persisted (never
 * the raw base64).
 *
 * Degrades gracefully: an unknown/missing state, a not-configured provider, a
 * provider error, or an exchange failure all redirect back with a friendly
 * `?error=` query rather than 500-ing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGN_PATH = "/documents/sign";
const FALLBACK_PATH = "/hub";

/**
 * 302 back to the app. Always clears the one-shot PKCE cookie (whether or not it
 * was used) so a verifier never lingers past a single round-trip.
 */
function redirectTo(url: URL): Response {
  const headers = new Headers({ Location: url.toString() });
  headers.append(
    "Set-Cookie",
    `${PKCE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
  return new Response(null, { status: 302, headers });
}

/** Read a single cookie value out of a raw Cookie header (no next/headers dep). */
function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  // No state → we can't key the row; send somewhere safe.
  if (!state) {
    const back = new URL(SIGN_PATH, url.origin);
    back.searchParams.set("error", "Verification failed — no signing session was provided.");
    return redirectTo(back);
  }

  // Load the pending row this verification belongs to.
  let found: (typeof documentSignatures.$inferSelect)[] = [];
  try {
    found = await db
      .select()
      .from(documentSignatures)
      .where(eq(documentSignatures.id, state))
      .limit(1);
  } catch {
    found = [];
  }
  const row = found[0];
  if (!row) {
    const fallback = new URL(FALLBACK_PATH, url.origin);
    fallback.searchParams.set("error", "This signing session is no longer valid.");
    return redirectTo(fallback);
  }

  // Build the "back to the signing page" URL for this specific document.
  const back = (extra: Record<string, string>): URL => {
    const u = new URL(SIGN_PATH, url.origin);
    u.searchParams.set("kind", row.docKind);
    u.searchParams.set("doc", row.docId);
    u.searchParams.set("sig", row.id);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u;
  };

  // Already signed → nothing to verify; bounce back cleanly.
  if (row.status === "signed") {
    return redirectTo(back({ verified: "1" }));
  }

  if (providerError) {
    return redirectTo(back({ error: "DigiLocker verification was cancelled or denied." }));
  }
  if (!code) {
    return redirectTo(back({ error: "DigiLocker did not return an authorization code." }));
  }
  if (!isDigiLockerConfigured()) {
    return redirectTo(back({ error: "Identity verification isn't configured yet." }));
  }

  // PKCE: recover the verifier from the one-shot cookie and bind its state to
  // the state DigiLocker echoed back (CSRF defence-in-depth). When PKCE is on
  // and the cookie is missing/mismatched, fail the verification cleanly.
  let codeVerifier: string | undefined;
  if (isPkceEnabled()) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const raw = readCookie(cookieHeader, PKCE_COOKIE);
    const parsed = parsePkceCookie(raw);
    if (!parsed || parsed.state !== state) {
      return redirectTo(
        back({ error: "Your signing session expired. Please start signing again." }),
      );
    }
    codeVerifier = parsed.verifier;
  }

  // Exchange the code for the verified identity (masked Aadhaar only).
  let kyc;
  try {
    kyc = await exchangeCodeForKyc(code, codeVerifier);
  } catch {
    // Never surface provider internals to the URL.
    return redirectTo(back({ error: "We couldn't verify your identity with DigiLocker. Please try again." }));
  }

  // Upload the DigiLocker photo (if any) to the private bucket; store only the path.
  let photoPath: string | null = null;
  if (kyc.photoBase64) {
    try {
      const b64 = kyc.photoBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s+/g, "");
      const buffer = Buffer.from(b64, "base64");
      if (buffer.length > 0 && buffer.length <= 8 * 1024 * 1024) {
        const signerId = row.signerEmployeeId ?? row.id;
        const candidate = `${signerId}/identity/${randomUUID()}.jpg`;
        const { error: upErr } = await getSupabaseAdmin()
          .storage.from(DOCUMENTS_BUCKET)
          .upload(candidate, buffer, { contentType: "image/jpeg", upsert: false });
        if (!upErr) photoPath = candidate;
      }
    } catch {
      // A photo failure must never fail the verification.
      photoPath = null;
    }
  }

  try {
    await db
      .update(documentSignatures)
      .set({
        status: "verified",
        verifiedName: kyc.name,
        verifiedDob: kyc.dob,
        verifiedGender: kyc.gender,
        verifiedAddress: kyc.address,
        maskedAadhaar: kyc.maskedAadhaar,
        photoPath,
        digilockerRef: kyc.ref,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentSignatures.id, row.id));
  } catch {
    return redirectTo(back({ error: "We verified your identity but couldn't save it. Please try again." }));
  }

  return redirectTo(back({ verified: "1" }));
}
