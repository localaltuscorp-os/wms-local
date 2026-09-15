/**
 * DigiLocker → Candidate Interview Form auto-fill: the PURE half.
 *
 * No db, no env, no server-only imports, so the route handlers and the tests
 * share exactly one copy of this logic.
 *
 * ── WHY DIGILOCKER AND NOT AN AADHAAR LOOKUP ────────────────────────────────
 * There is no free way to turn a 12-digit Aadhaar number into an address.
 * Demographic lookup is restricted under the Aadhaar Act to UIDAI-licensed
 * AUA/KUA entities, and every such channel is a paid commercial contract (see
 * app/api/hr/aadhaar-lookup/route.ts, which is that paid path and stays dormant
 * until its credentials are set).
 *
 * DigiLocker inverts who is asking. The CANDIDATE signs in to their own
 * DigiLocker and consents to share their Aadhaar demographics with us; we never
 * hold their Aadhaar number, and there is no per-call fee. It still requires the
 * organisation to be onboarded with APISetu / Meri Pehchaan for the
 * DIGILOCKER_* credentials - free, but not zero-setup.
 */
import { normalizeDob, normalizeGender, type KycFields } from "./aadhaar-kyc";

/**
 * State prefix that marks an OAuth round-trip as belonging to THIS flow.
 *
 * DigiLocker validates `redirect_uri` against the single URL registered for the
 * client, so this flow cannot have a callback route of its own - it shares
 * /api/digilocker/callback with document signing. That route dispatches on this
 * prefix. Signing states are bare UUIDs, which can never collide with it.
 */
export const INTAKE_KYC_STATE_PREFIX = "hrkyc_";

export function isIntakeKycState(state: string | null | undefined): boolean {
  return typeof state === "string" && state.startsWith(INTAKE_KYC_STATE_PREFIX);
}

export function makeIntakeKycState(token: string): string {
  return `${INTAKE_KYC_STATE_PREFIX}${token}`;
}

/** The subset of the form DigiLocker can answer for. */
export interface IntakeKycFill {
  name?: string;
  dob?: string;
  gender?: string;
  mobile?: string;
  /** One flat address line; the form splits it into its structured fields. */
  location?: string;
}

/**
 * Map a DigiLocker e-KYC payload onto the intake form's auto-fill shape.
 *
 * Empty/absent values are OMITTED rather than sent as "" - the form's onFill
 * only writes truthy keys, so an absent field must not overwrite something the
 * user already typed.
 *
 * DigiLocker's demographic payload carries no mobile number, so `mobile` is
 * never set here. That is a property of the source, not an oversight: the paid
 * lookup does return one, which is why the shared shape has the field.
 */
export function digiLockerKycToFill(kyc: {
  name?: string | null;
  dob?: string | null;
  gender?: string | null;
  address?: string | null;
}): IntakeKycFill {
  const out: IntakeKycFill = {};
  const name = (kyc.name ?? "").trim();
  if (name) out.name = name;
  const dob = normalizeDob((kyc.dob ?? "").trim());
  if (dob) out.dob = dob;
  const gender = normalizeGender((kyc.gender ?? "").trim());
  if (gender) out.gender = gender;
  const address = (kyc.address ?? "").trim();
  if (address) out.location = address;
  return out;
}

/** How many fields a fill will actually write - drives the "Auto-filled N" copy. */
export function countFilled(fill: IntakeKycFill | KycFields): number {
  return Object.values(fill).filter((v) => typeof v === "string" && v.trim() !== "").length;
}

/**
 * Where the browser goes after the round-trip.
 *
 * Only a same-origin ABSOLUTE PATH under /hr is allowed. The value arrives as a
 * query parameter on a route that then issues a 302, which is an open-redirect
 * primitive if taken at face value: `//evil.test` and `https://evil.test` are
 * both accepted by URL parsers as other origins, and a bare `/` would let this
 * bounce anywhere in the app. Anything that fails the check falls back to the
 * intake form rather than erroring - the user still lands somewhere sensible.
 */
export const INTAKE_KYC_FALLBACK_RETURN = "/hr/intake";

export function safeReturnPath(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/")) return INTAKE_KYC_FALLBACK_RETURN;
  // "//host" and "/\host" are protocol-relative - a different origin.
  if (v.startsWith("//") || v.startsWith("/\\")) return INTAKE_KYC_FALLBACK_RETURN;
  if (!v.startsWith("/hr/")) return INTAKE_KYC_FALLBACK_RETURN;
  if (v.includes("\n") || v.includes("\r")) return INTAKE_KYC_FALLBACK_RETURN;
  return v;
}
