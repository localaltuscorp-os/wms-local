// Standalone Firebase Admin credential check — isolates the login problem from
// the whole app. Run:
//   pnpm tsx --env-file=.env.local scripts/test-firebase-auth.ts
//
// It prints whether the three FIREBASE_* env vars are present and well-formed,
// then actually calls Google with the service account to surface the REAL error.
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function mask(s: string | undefined, keep = 6) {
  if (!s) return "(missing)";
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)} (len ${s.length})`;
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY;

console.log("\n=== FIREBASE_* env check ===");
console.log("FIREBASE_PROJECT_ID   :", projectId ?? "(missing)");
console.log("FIREBASE_CLIENT_EMAIL :", clientEmail ?? "(missing)");
console.log("FIREBASE_PRIVATE_KEY  :", mask(rawKey));

if (!projectId || !clientEmail || !rawKey) {
  console.error("\n✗ One or more FIREBASE_* vars are missing from .env.local.");
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, "\n");
console.log("\n=== private key shape ===");
console.log("starts with header? :", privateKey.includes("-----BEGIN PRIVATE KEY-----"));
console.log("ends with footer?   :", privateKey.includes("-----END PRIVATE KEY-----"));
console.log("has real newlines?  :", privateKey.includes("\n"));
console.log("number of lines     :", privateKey.split("\n").length, "(a valid key is ~28)");

async function main() {
  try {
    const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
    console.log("\n=== calling Google (listUsers) ... ===");
    const res = await getAuth(app).listUsers(1);
    console.log(`✓ SUCCESS — credential works. Project has at least ${res.users.length} user(s).`);
    console.log("  → Your keys are GOOD. If the app still fails, it's reading a different .env.local.");
  } catch (err: unknown) {
    const e = err as { errorInfo?: { code?: string; message?: string }; message?: string };
    console.error("\n✗ FAILED — the real Firebase error is:");
    console.error("  code   :", e.errorInfo?.code ?? "(none)");
    console.error("  message:", e.errorInfo?.message ?? e.message ?? String(err));
    console.error("\nWhat it means:");
    const msg = (e.errorInfo?.message || e.message || "").toLowerCase();
    if (msg.includes("token_expired") || msg.includes("invalid_grant") || msg.includes("timeframe")) {
      console.error("  → CLOCK SKEW: your PC time differs from Google's. Sync the Windows clock.");
    } else if (msg.includes("pem") || msg.includes("decoder") || msg.includes("parse")) {
      console.error("  → BAD KEY FORMAT: FIREBASE_PRIVATE_KEY in .env.local is malformed (the \\n / quotes).");
    } else if (msg.includes("not found") || msg.includes("project")) {
      console.error("  → WRONG/UNKNOWN PROJECT: FIREBASE_PROJECT_ID doesn't match the key's project.");
    } else if (msg.includes("invalid_client") || msg.includes("account not found") || msg.includes("disabled")) {
      console.error("  → KEY REVOKED/DISABLED on Google's side. Generate a NEW service-account key.");
    } else {
      console.error("  → See the message above; share it and I'll tell you the exact fix.");
    }
    process.exit(1);
  }
}
main();
