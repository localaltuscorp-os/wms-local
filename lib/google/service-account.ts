import crypto from "node:crypto";

/**
 * Mint a Google API access token for the Firebase service account
 * (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY), used by the nightly backup to
 * write the Google Sheet + upload files to the Shared Drive. Signs a JWT
 * locally (RS256) and exchanges it at the token endpoint — same fetch-only
 * style as lib/google/calendar.ts, no SDK.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export async function getServiceAccountToken(scopes: string[]): Promise<string> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error("Missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY for backup auth");
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: scopes.join(" "),
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Service-account token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in token response");
  return json.access_token;
}

export const GOOGLE_SCOPES = {
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  // Least-privilege READ scope — pure mirrors/syncs that never write a sheet
  // should mint their token with this so a compromised call-path still cannot
  // modify any sheet shared with the service account.
  sheetsReadonly: "https://www.googleapis.com/auth/spreadsheets.readonly",
  drive: "https://www.googleapis.com/auth/drive",
  // Firebase Cloud Messaging (FCM HTTP v1) — send native-mobile push.
  messaging: "https://www.googleapis.com/auth/firebase.messaging",
} as const;
