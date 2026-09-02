import "server-only";

import { getServiceAccountToken } from "@/lib/google/service-account";

/**
 * Play Integrity server-side verification (anti-proxy Phase 2, Android).
 *
 * The app calls Play Integrity with the server's punch nonce and returns the
 * signed token; here we ask Google to decode it and read the verdict:
 *   - appRecognitionVerdict == PLAY_RECOGNIZED  → genuine, unmodified app.
 *   - deviceRecognitionVerdict contains MEETS_DEVICE_INTEGRITY / _STRONG_ →
 *     genuine, un-rooted, non-emulated device (STRONG = hardware-backed).
 *   - requestDetails.nonce == our issued nonce → not a replay/relay.
 *
 * DORMANT-READY (mirrors the DigiLocker pattern): unless PLAY_INTEGRITY_ENABLED
 * is set AND a Google service account (FIREBASE_CLIENT_EMAIL/_PRIVATE_KEY) can
 * reach the Play Integrity API for the app's Play Console project, this returns
 * `configured:false / verdict:"unverified"` — which `enforce` mode does NOT
 * block on. So a provisioning gap never locks anyone out; it just doesn't add
 * protection until the credentials + Play Console linkage exist.
 *
 * PROVISIONING (one-time, ops): in Google Cloud project `altuscorp-e7140` enable
 * the Play Integrity API; in Play Console → the app → link the Cloud project and
 * grant the service account access; then set PLAY_INTEGRITY_ENABLED=true (and
 * PLAY_INTEGRITY_PACKAGE if the package differs from the default).
 */

const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";
const DEFAULT_PACKAGE = "com.altuscorp.altus";

export type IntegrityVerdict = "strong" | "device" | "basic" | "failed" | "unverified";

export interface PlayIntegrityResult {
  configured: boolean;
  /** Passes the anti-proxy bar: genuine app + genuine device + nonce match. */
  ok: boolean;
  verdict: IntegrityVerdict;
  appRecognized: boolean;
  nonceMatch: boolean;
  /** Reason when it did not pass (for the audit trail). */
  detail?: string;
}

export function isPlayIntegrityConfigured(): boolean {
  return (
    process.env.PLAY_INTEGRITY_ENABLED === "true" &&
    !!process.env.FIREBASE_CLIENT_EMAIL &&
    !!process.env.FIREBASE_PRIVATE_KEY
  );
}

const UNVERIFIED: PlayIntegrityResult = {
  configured: false,
  ok: false,
  verdict: "unverified",
  appRecognized: false,
  nonceMatch: false,
  detail: "not-configured",
};

/**
 * Verify an Android Play Integrity token, checking it embeds `expectedNonce`.
 * Never throws — a transport/parse failure returns a non-ok, configured result
 * so callers decide (report vs enforce). Returns UNVERIFIED when dormant.
 */
export async function verifyPlayIntegrity(
  token: string | undefined | null,
  expectedNonce: string,
): Promise<PlayIntegrityResult> {
  if (!isPlayIntegrityConfigured()) return UNVERIFIED;
  const integrityToken = (token ?? "").trim();
  if (!integrityToken) {
    return { configured: true, ok: false, verdict: "failed", appRecognized: false, nonceMatch: false, detail: "no-token" };
  }

  const pkg = process.env.PLAY_INTEGRITY_PACKAGE?.trim() || DEFAULT_PACKAGE;
  try {
    const accessToken = await getServiceAccountToken([PLAY_INTEGRITY_SCOPE]);
    const res = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(pkg)}:decodeIntegrityToken`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ integrityToken }),
      },
    );
    if (!res.ok) {
      return { configured: true, ok: false, verdict: "failed", appRecognized: false, nonceMatch: false, detail: `decode-http-${res.status}` };
    }
    const json = (await res.json()) as {
      tokenPayloadExternal?: {
        requestDetails?: { nonce?: string; requestHash?: string };
        appIntegrity?: { appRecognitionVerdict?: string };
        deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
      };
    };
    const payload = json.tokenPayloadExternal ?? {};
    const nonceMatch = (payload.requestDetails?.nonce ?? payload.requestDetails?.requestHash) === expectedNonce;
    const appRecognized = payload.appIntegrity?.appRecognitionVerdict === "PLAY_RECOGNIZED";
    const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const verdict: IntegrityVerdict = deviceVerdicts.includes("MEETS_STRONG_INTEGRITY")
      ? "strong"
      : deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY")
        ? "device"
        : deviceVerdicts.includes("MEETS_BASIC_INTEGRITY")
          ? "basic"
          : "failed";

    const deviceOk = verdict === "strong" || verdict === "device";
    const ok = appRecognized && deviceOk && nonceMatch;
    const detail = ok
      ? undefined
      : [!appRecognized && "app-not-recognized", !deviceOk && `device-${verdict}`, !nonceMatch && "nonce-mismatch"]
          .filter(Boolean)
          .join(",");
    return { configured: true, ok, verdict, appRecognized, nonceMatch, detail };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      verdict: "failed",
      appRecognized: false,
      nonceMatch: false,
      detail: `error:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
