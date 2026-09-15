import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { isDigiLockerConfigured } from "@/lib/digilocker/config";

/**
 * GET /api/hr/aadhaar/methods — which Aadhaar auto-fill routes are live.
 *
 * The form asks once, so it can offer the button that will actually work rather
 * than a "Fetch" that always fails:
 *   provider   — the paid licensed KYC lookup (types a number, gets an answer)
 *   digilocker — the free consent flow (the candidate authorises the share)
 *
 * Only booleans cross the wire; no endpoint, key or provider name leaks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const me = await requireUser();
    if (!(await isHrStaff(me))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    provider: Boolean(process.env.AADHAAR_LOOKUP_URL && process.env.AADHAAR_LOOKUP_KEY),
    digilocker: isDigiLockerConfigured(),
  });
}
