import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import type { IntakeKycFill } from "@/lib/hr/candidate/digilocker-intake";
import {
  KYC_RESULT_COOKIE,
  parseResultCookie,
  readCookie,
  clearKycCookie,
} from "@/lib/hr/candidate/intake-kyc-cookies";

/**
 * GET /api/hr/aadhaar/digilocker/result — hand the just-consented demographics
 * to the form, ONCE.
 *
 * The callback parks the fields in a short-lived HttpOnly cookie because a 302
 * cannot carry a body. The form calls this on landing; the response always
 * clears the cookie, so a reload cannot replay someone's KYC into a different
 * candidate's form.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isHrStaff(me))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const raw = readCookie(request.headers.get("cookie"), KYC_RESULT_COOKIE);
  const fields = parseResultCookie<IntakeKycFill>(raw);

  const res = NextResponse.json(
    fields ? { ok: true, found: true, fields } : { ok: true, found: false },
  );
  // Cleared whether or not anything was found — a malformed cookie must not
  // survive to be retried on every page load.
  res.headers.append("Set-Cookie", clearKycCookie(KYC_RESULT_COOKIE));
  return res;
}
