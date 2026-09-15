import "server-only";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  isDigiLockerConfigured,
  isPkceEnabled,
  generatePkce,
  buildAuthUrl,
} from "@/lib/digilocker/config";
import {
  makeIntakeKycState,
  safeReturnPath,
  INTAKE_KYC_FALLBACK_RETURN,
} from "@/lib/hr/candidate/digilocker-intake";
import {
  KYC_FLOW_COOKIE,
  KYC_FLOW_MAX_AGE,
  serializeFlowCookie,
  kycCookieHeader,
} from "@/lib/hr/candidate/intake-kyc-cookies";

/**
 * GET /api/hr/aadhaar/digilocker/start?return=/hr/intake?draft=…
 *
 * Begins the candidate's DigiLocker consent. Redirects the browser to
 * DigiLocker's authorize screen, where the CANDIDATE signs in and consents to
 * share their Aadhaar demographics; DigiLocker sends them back to
 * /api/digilocker/callback, which finishes the job.
 *
 * A full-page redirect is safe here because the intake form autosaves its draft
 * to the database and re-opens from `?draft=<id>` — so `return` carries the
 * user back to the same half-filled form.
 *
 * Every failure 302s back to the form with `?kyc_error=` rather than showing a
 * JSON error page: the user is mid-form and needs to keep typing, not read a
 * stack trace.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(origin: string, ret: string, error?: string): Response {
  const url = new URL(ret, origin);
  if (error) url.searchParams.set("kyc_error", error);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ret = safeReturnPath(url.searchParams.get("return"));

  let me;
  try {
    me = await requireUser();
  } catch {
    return back(url.origin, INTAKE_KYC_FALLBACK_RETURN, "Sign in first.");
  }
  // Same gate as the form itself — this reveals another person's demographics,
  // so it is HR-staff only, not merely signed-in.
  if (!(await isHrStaff(me))) {
    return back(url.origin, ret, "You do not have access to Aadhaar verification.");
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return back(url.origin, ret, limited.error);

  if (!isDigiLockerConfigured()) {
    return back(
      url.origin,
      ret,
      "DigiLocker isn't connected yet — ask an administrator to add the DIGILOCKER_* credentials.",
    );
  }

  const state = makeIntakeKycState(randomUUID());
  const pkce = isPkceEnabled() ? generatePkce() : null;

  let authUrl: string;
  try {
    authUrl = buildAuthUrl({ state, codeChallenge: pkce?.challenge });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not start DigiLocker.";
    return back(url.origin, ret, msg);
  }

  const headers = new Headers({ Location: authUrl });
  headers.append(
    "Set-Cookie",
    kycCookieHeader(
      KYC_FLOW_COOKIE,
      serializeFlowCookie({ state, verifier: pkce?.verifier ?? "", ret }),
      KYC_FLOW_MAX_AGE,
    ),
  );
  return new Response(null, { status: 302, headers });
}
