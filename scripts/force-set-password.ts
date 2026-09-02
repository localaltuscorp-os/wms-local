/**
 * Force-set a Firebase user's password via Admin SDK.
 *
 * Bypasses the email-reset chain entirely — useful when the reset link
 * expired, bounced, or the dev environment is stuck.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/force-set-password.ts \
 *     --email manan.vasa@gmail.com --password 'TempPass123!'
 *
 * Reads Firebase Admin creds from .env.local (FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).  Marks the email as
 * verified and ensures the account is not disabled.
 */

import { parseArgs } from "node:util";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const { values } = parseArgs({
    options: {
      email:    { type: "string" },
      password: { type: "string" },
    },
  });

  const email = values.email;
  const password = values.password ?? "TempPass123!";

  if (!email) {
    console.error("Usage: pnpm tsx --env-file=.env.local scripts/force-set-password.ts --email <e> [--password <p>]");
    process.exit(1);
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) {
    throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();

  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    password,
    emailVerified: true,
    disabled: false,
  });
  await auth.setCustomUserClaims(user.uid, { role: "authenticated" });

  console.log("\n✓ Password set");
  console.log(`  uid:        ${user.uid}`);
  console.log(`  email:      ${user.email}`);
  console.log(`  password:   ${password}`);
  console.log(`  has hash:   ${!!user.passwordHash}  (was)`);
  console.log("\nSign in: http://localhost:3000/login");
  console.log("Email:   " + email);
  console.log("Password: " + password + "\n");
}

main().catch((err) => {
  console.error("\n✗ FAILED");
  console.error(err);
  process.exit(1);
});
