import "server-only";
import { isDigiLockerConfigured, isPkceEnabled, exchangeCodeForKyc } from "@/lib/digilocker/config";
import {
  digiLockerKycToFill,
  countFilled,
  safeReturnPath,
  INTAKE_KYC_FALLBACK_RETURN,
} from "./digilocker-intake";
import {
  KYC_FLOW_COOKIE,
  KYC_RESULT_COOKIE,
  KYC_RESULT_MAX_AGE,
  parseFlowCookie,
  serializeResultCookie,
  kycCookieHeader,
  clearKycCookie,
  readCookie,
} from "./intake-kyc-cookies";

/**
 * The Candidate-Interview-Form branch of /api/digilocker/callback.
 *
 * It lives here rather than inline in the route because that route already owns
 * the whole document-SIGNING flow; a second, unrelated flow spliced into the
 * same function would make both harder to follow. The route dispatches on the
 * state prefix and calls this.
 *
 * On success the demographics are parked in a one-shot HttpOnly cookie and the
 * browser is sent back to the form, which reads them via
 * /api/hr/aadhaar/digilocker/result.
 *
 * NOTHING THROWS OUT OF HERE. The user is standing in a half-filled form; every
 * failure returns them to it with a readable `?kyc_error=` and the flow cookie
 * cleared, never a 500.
 */
export async function handleIntakeKycCallback(
  request: Request,
  url: URL,
  state: string,
  code: string | null,
  providerError: string | null,
): Promise<Response> {
  const flow = parseFlowCookie(readCookie(request.headers.get("cookie"), KYC_FLOW_COOKIE));
  const ret = safeReturnPath(flow?.ret || INTAKE_KYC_FALLBACK_RETURN);

  const back = (params: Record<string, string>): Response => {
    const dest = new URL(ret, url.origin);
    for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
    const headers = new Headers({ Location: dest.toString() });
    // The outbound cookie is one-shot: cleared on EVERY exit, success or not,
    // so a verifier can never be replayed.
    headers.append("Set-Cookie", clearKycCookie(KYC_FLOW_COOKIE));
    return new Response(null, { status: 302, headers });
  };

  // CSRF: the state DigiLocker echoed must be the one this browser started with.
  // Without this, a state pasted from elsewhere would be honoured.
  if (!flow || flow.state !== state) {
    return back({ kyc_error: "That verification link didn't match this browser session. Try again." });
  }
  if (providerError) {
    return back({ kyc_error: "DigiLocker cancelled the verification." });
  }
  if (!code) {
    return back({ kyc_error: "DigiLocker didn't return an authorisation code." });
  }
  if (!isDigiLockerConfigured()) {
    return back({ kyc_error: "DigiLocker isn't connected yet." });
  }

  let fill;
  try {
    const kyc = await exchangeCodeForKyc(code, isPkceEnabled() ? flow.verifier : undefined);
    fill = digiLockerKycToFill(kyc);
  } catch (err) {
    // Log WITHOUT the code or any demographic value.
    console.error("[intake-kyc] DigiLocker exchange failed:", err instanceof Error ? err.message : err);
    return back({ kyc_error: "DigiLocker verification failed — enter the details manually." });
  }

  if (countFilled(fill) === 0) {
    return back({ kyc_error: "DigiLocker returned no details for this person." });
  }

  const dest = new URL(ret, url.origin);
  dest.searchParams.set("kyc", "1");
  const headers = new Headers({ Location: dest.toString() });
  headers.append("Set-Cookie", clearKycCookie(KYC_FLOW_COOKIE));
  headers.append(
    "Set-Cookie",
    kycCookieHeader(KYC_RESULT_COOKIE, serializeResultCookie(fill), KYC_RESULT_MAX_AGE),
  );
  return new Response(null, { status: 302, headers });
}
