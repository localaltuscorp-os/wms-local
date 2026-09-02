import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { issuePunchNonce } from "@/lib/attendance/punch-nonce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * POST /api/mobile/attendance/nonce — issue a one-time punch nonce. The app then
 * requests a Play Integrity (Android) / App Attest (iOS) token OVER this nonce
 * and returns both with the punch, so the server can bind the attestation to a
 * single, fresh request (anti-replay / anti-relay).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const limited = rateLimitOrError(auth.employee.id, "write");
  if (limited) {
    return NextResponse.json({ ok: false, error: limited.error }, { status: 429, headers: MOBILE_CORS });
  }

  const { nonce, expiresAt } = await issuePunchNonce(auth.employee.id);
  return NextResponse.json({ ok: true, nonce, expiresAt: expiresAt.toISOString() }, { headers: MOBILE_CORS });
}
