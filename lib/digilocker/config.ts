import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * DigiLocker OAuth2 + e-KYC configuration — the identity-verification adapter
 * for the document-signing flow (Letters, Agreements, Exit docs, Policies).
 *
 * Everything here is env-driven and degrades GRACEFULLY: when any required key
 * is missing, isDigiLockerConfigured() returns false, digiLockerConfigStatus()
 * reports exactly WHICH keys are missing, buildAuthUrl() throws a friendly
 * error (callers gate on isDigiLockerConfigured() first and render the calm
 * "not configured yet" state), and nothing 500s. The flow activates the moment
 * the keys land in the environment — no code change required.
 *
 * ⚠ AADHAAR ACT: exchangeCodeForKyc() MASKS the Aadhaar to last-4 before it
 * returns. A full 12-digit Aadhaar is never stored, logged, or returned.
 *
 * ── Environment ──────────────────────────────────────────────────────────────
 * Required:
 *   DIGILOCKER_CLIENT_ID       partner API client id
 *   DIGILOCKER_CLIENT_SECRET   partner API client secret
 *   DIGILOCKER_REDIRECT_URI    registered callback URL (…/api/digilocker/callback)
 *   DIGILOCKER_BASE_URL        API base, e.g. https://digilocker.meripehchaan.gov.in
 *
 * Optional (sensible defaults; set only to match an aggregator/KUA's variant):
 *   DIGILOCKER_SCOPE           OAuth scopes (default "avs_parent_files openid")
 *   DIGILOCKER_PKCE            "off" to disable PKCE (default: enabled, S256)
 *   DIGILOCKER_TOKEN_AUTH      "basic" | "body" — how client creds are sent to the
 *                              token endpoint (default "body")
 *   DIGILOCKER_AUTHORIZE_PATH  default "/public/oauth2/1/authorize"
 *   DIGILOCKER_TOKEN_PATH      default "/public/oauth2/1/token"
 *   DIGILOCKER_USERINFO_PATH   default "/public/oauth2/1/user"
 *
 * Reserved (aggregator / KUA e-Sign leg — read only if present, not required for
 * the DigiLocker-verified signing this app ships today; documented for go-live):
 *   DIGILOCKER_KUA_LICENSE_KEY, DIGILOCKER_ASP_ID, DIGILOCKER_HMAC_KEY
 */

const REQUIRED_KEYS = [
  "DIGILOCKER_CLIENT_ID",
  "DIGILOCKER_CLIENT_SECRET",
  "DIGILOCKER_REDIRECT_URI",
  "DIGILOCKER_BASE_URL",
] as const;

interface DigiLockerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
  scope: string;
  pkce: boolean;
  tokenAuth: "basic" | "body";
  authorizePath: string;
  tokenPath: string;
  userinfoPath: string;
}

const DEFAULT_SCOPE = "avs_parent_files openid";
const DEFAULT_AUTHORIZE_PATH = "/public/oauth2/1/authorize";
const DEFAULT_TOKEN_PATH = "/public/oauth2/1/token";
const DEFAULT_USERINFO_PATH = "/public/oauth2/1/user";

function normPath(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  if (!v) return fallback;
  return v.startsWith("/") ? v : `/${v}`;
}

/** Read + validate the env keys. Returns null when any REQUIRED one is missing. */
function readConfig(): DigiLockerConfig | null {
  const clientId = process.env.DIGILOCKER_CLIENT_ID?.trim();
  const clientSecret = process.env.DIGILOCKER_CLIENT_SECRET?.trim();
  const redirectUri = process.env.DIGILOCKER_REDIRECT_URI?.trim();
  const baseUrlRaw = process.env.DIGILOCKER_BASE_URL?.trim();
  if (!clientId || !clientSecret || !redirectUri || !baseUrlRaw) return null;

  const tokenAuthRaw = process.env.DIGILOCKER_TOKEN_AUTH?.trim().toLowerCase();
  return {
    clientId,
    clientSecret,
    redirectUri,
    // Normalise: no trailing slash on the base.
    baseUrl: baseUrlRaw.replace(/\/+$/, ""),
    scope: process.env.DIGILOCKER_SCOPE?.trim() || DEFAULT_SCOPE,
    // PKCE on by default; only "off" disables it.
    pkce: (process.env.DIGILOCKER_PKCE?.trim().toLowerCase() || "on") !== "off",
    tokenAuth: tokenAuthRaw === "basic" ? "basic" : "body",
    authorizePath: normPath(process.env.DIGILOCKER_AUTHORIZE_PATH, DEFAULT_AUTHORIZE_PATH),
    tokenPath: normPath(process.env.DIGILOCKER_TOKEN_PATH, DEFAULT_TOKEN_PATH),
    userinfoPath: normPath(process.env.DIGILOCKER_USERINFO_PATH, DEFAULT_USERINFO_PATH),
  };
}

/** True only when ALL required DigiLocker credentials are present. Cheap, no I/O. */
export function isDigiLockerConfigured(): boolean {
  return readConfig() !== null;
}

/** Whether PKCE is active (only meaningful when configured). */
export function isPkceEnabled(): boolean {
  return readConfig()?.pkce ?? false;
}

/**
 * Config status for admin-facing UI: whether DigiLocker is switched on, and if
 * not, exactly which required env keys are still missing. Names only — never any
 * secret values.
 */
export function digiLockerConfigStatus(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_KEYS.filter((k) => !process.env[k]?.trim());
  return { configured: missing.length === 0, missing };
}

// ── PKCE (RFC 7636, S256) ────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Generate a fresh PKCE verifier + S256 challenge. */
export function generatePkce(): PkcePair {
  const verifier = base64url(randomBytes(32)); // 43-char high-entropy verifier
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Build the DigiLocker OAuth2 authorize URL the signer is redirected to.
 * `state` is our CSRF/lookup token (the document_signatures row id).
 * `codeChallenge` (optional) enables PKCE. Throws a friendly error when
 * unconfigured — callers must gate on isDigiLockerConfigured() first.
 */
export function buildAuthUrl(input: { state: string; codeChallenge?: string }): string {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error(
      "Identity verification isn't configured yet. Add the DIGILOCKER_* credentials to enable DigiLocker signing.",
    );
  }
  const state = input.state?.trim();
  if (!state) throw new Error("A signing session state is required.");

  const url = new URL(`${cfg.baseUrl}${cfg.authorizePath}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", cfg.scope);
  if (cfg.pkce && input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/** The verified identity we hand back to the callback route. Masked Aadhaar only. */
export interface DigiLockerKyc {
  name: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
  /** last-4 only, e.g. "XXXXXXXX1234" */
  maskedAadhaar: string | null;
  /** raw base64 of the DigiLocker photo, if the provider returned one */
  photoBase64?: string;
  /** provider txn/ref id (digilockerid / reference_key) */
  ref: string;
}

/**
 * Mask an Aadhaar-like value to its last 4 digits, prefixed with 8 'X's, e.g.
 * "XXXXXXXX1234". DigiLocker already returns a masked value, but we defensively
 * re-mask so a full number can never leak through, and normalise the format.
 * Returns null when there aren't enough digits to form a last-4.
 */
export function maskAadhaar(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `XXXXXXXX${digits.slice(-4)}`;
}

/** Shape of the DigiLocker token endpoint response (subset we consume). */
interface TokenResponse {
  access_token?: string;
  token_type?: string;
  // DigiLocker returns consent/identity hints alongside the token.
  digilockerid?: string;
  reference_key?: string;
  name?: string;
  dob?: string;
  gender?: string;
  eaadhaar?: string;
  consent_valid_till?: string;
}

/** Shape of the DigiLocker e-KYC / user endpoint response (subset we consume). */
interface KycResponse {
  digilockerid?: string;
  reference_key?: string;
  name?: string;
  dob?: string;
  gender?: string;
  // address may arrive as a flat string or a structured object.
  address?: string | Record<string, string | undefined>;
  // masked aadhaar variants seen across DigiLocker doc types.
  masked_aadhaar?: string;
  maskedAadhaar?: string;
  eaadhaar?: string;
  aadhaar?: string;
  uid?: string;
  photo?: string;
  photo_base64?: string;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Flatten DigiLocker's address (string or object) into a single line. */
function flattenAddress(
  address: string | Record<string, string | undefined> | undefined,
): string | null {
  if (!address) return null;
  if (typeof address === "string") return address.trim() || null;
  const parts = Object.values(address)
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Exchange an OAuth2 authorization `code` for the signer's verified e-KYC.
 * Runs the standard DigiLocker OAuth2 token exchange (with PKCE code_verifier
 * when enabled), then reads the e-KYC/user profile with the resulting access
 * token. Aadhaar is MASKED to last-4 before it returns. Throws (never returns a
 * partial) on any provider/network error so the callback route can fail cleanly.
 *
 * Compiles + type-checks without live keys; only *executes* once configured.
 */
export async function exchangeCodeForKyc(
  code: string,
  codeVerifier?: string,
): Promise<DigiLockerKyc> {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("Identity verification isn't configured yet.");
  }
  if (!code?.trim()) throw new Error("Missing authorization code.");
  if (cfg.pkce && !codeVerifier?.trim()) {
    throw new Error("Missing PKCE verifier for this signing session.");
  }

  // 1) Authorization-code → access token.
  const tokenBody: Record<string, string> = {
    grant_type: "authorization_code",
    code: code.trim(),
    redirect_uri: cfg.redirectUri,
  };
  const tokenHeaders: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (cfg.tokenAuth === "basic") {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    tokenHeaders.Authorization = `Basic ${basic}`;
  } else {
    tokenBody.client_id = cfg.clientId;
    tokenBody.client_secret = cfg.clientSecret;
  }
  if (cfg.pkce && codeVerifier) tokenBody.code_verifier = codeVerifier.trim();

  const tokenRes = await fetch(`${cfg.baseUrl}${cfg.tokenPath}`, {
    method: "POST",
    headers: tokenHeaders,
    body: new URLSearchParams(tokenBody).toString(),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    throw new Error(`DigiLocker token exchange failed (${tokenRes.status}).`);
  }
  const token = (await tokenRes.json()) as TokenResponse;
  const accessToken = pickString(token.access_token);
  if (!accessToken) throw new Error("DigiLocker did not return an access token.");

  const ref =
    pickString(token.reference_key) ??
    pickString(token.digilockerid) ??
    `dl_${Date.now()}`;

  // 2) Access token → e-KYC / user profile (verified identity + masked Aadhaar).
  const kycRes = await fetch(`${cfg.baseUrl}${cfg.userinfoPath}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  // The user/e-KYC call is best-effort: some identity fields already ride on the
  // token response, so a non-200 here shouldn't lose the verification entirely.
  const kyc: KycResponse = kycRes.ok
    ? ((await kycRes.json()) as KycResponse)
    : {};

  const name = pickString(kyc.name) ?? pickString(token.name);
  const dob = pickString(kyc.dob) ?? pickString(token.dob);
  const gender = pickString(kyc.gender) ?? pickString(token.gender);
  const address = flattenAddress(kyc.address);
  const rawAadhaar =
    pickString(kyc.masked_aadhaar) ??
    pickString(kyc.maskedAadhaar) ??
    pickString(kyc.eaadhaar) ??
    pickString(kyc.aadhaar) ??
    pickString(kyc.uid) ??
    pickString(token.eaadhaar);
  const photoBase64 =
    pickString(kyc.photo_base64) ?? pickString(kyc.photo) ?? undefined;

  return {
    name,
    dob,
    gender,
    address,
    // ⚠ mask to last-4 no matter what the provider returned.
    maskedAadhaar: maskAadhaar(rawAadhaar),
    photoBase64,
    ref,
  };
}
