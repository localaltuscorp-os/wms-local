/**
 * One-time CLI to create the first admin employee on a brand-new deployment.
 *
 * Usage:
 *   cp .env.local .env.bootstrap   # copy and add SUPABASE_SERVICE_ROLE_KEY
 *   pnpm bootstrap-admin --email heteshvichare927@gmail.com --name "Hetesh Vichare"
 *
 * (pnpm 10 dropped the `--` separator — it's now passed as a literal arg.)
 *
 * Deletes the .env.bootstrap file afterwards.
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Resend } from "resend";
import { db } from "../lib/db";
import { siteUrl } from "../lib/site-url";
import { employees } from "../db/schema";
import { normalizeName } from "../lib/validators/employee";

async function sendResetPasswordEmail(args: { email: string; resetLink: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { id: null, error: "RESEND_API_KEY not set" };
  const from = process.env.RESEND_FROM_EMAIL || "Altus Corp Dashboard <onboarding@resend.dev>";
  try {
    const { data, error } = await new Resend(key).emails.send({
      from,
      to: args.email,
      subject: "Reset your Altus Corp password",
      html: `<p>Welcome to Altus Corp Dashboard. Set your password here:</p><p><a href="${args.resetLink}">${args.resetLink}</a></p>`,
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err: any) {
    return { id: null, error: err?.message ?? String(err) };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name:  { type: "string" },
    },
  });
  const email = values.email;
  const name  = values.name;

  if (!email || !name) {
    console.error("Usage: pnpm bootstrap-admin -- --email <email> --name \"<name>\"");
    process.exit(1);
  }

  // Init Firebase Admin from env
  const projectId   = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();

  // Check if already exists
  const existingByEmail = await db.query.employees.findFirst({
    where: eq(employees.email, email.toLowerCase().trim()),
  });
  if (existingByEmail) {
    console.error(`Employee with email ${email} already exists (id=${existingByEmail.id}). Aborting.`);
    process.exit(1);
  }

  // Step 1: Create Firebase user (Cloud Function will set the custom claim async)
  const fbUser = await auth.createUser({
    email: email.toLowerCase().trim(),
    emailVerified: true, // bootstrap admin doesn't need verification
    disabled: false,
  });
  // Belt-and-suspenders: set the claim synchronously here too
  await auth.setCustomUserClaims(fbUser.uid, { role: "authenticated" });

  // Step 2: Insert employees row
  const [emp] = await db.insert(employees).values({
    name:        normalizeName(name),
    email:       email.toLowerCase().trim(),
    role:        "both",
    isAdmin:     true,
    isActive:    true,
    firebaseUid: fbUser.uid,
    invitedAt:   new Date(),
  }).returning();
  if (!emp) {
    throw new Error("Employee insert returned no row — DB write may have failed silently.");
  }

  // Step 3: Generate password-reset link and email it
  const link = await auth.generatePasswordResetLink(email, {
    url: `${siteUrl()}/welcome`,
  });

  const sent = await sendResetPasswordEmail({ email, resetLink: link });
  if (sent.error) {
    console.warn("Email send failed — print the link manually:");
    console.warn(link);
  }

  console.log("\n✓ First admin bootstrapped:");
  console.log(`  id:           ${emp.id}`);
  console.log(`  firebase_uid: ${emp.firebaseUid}`);
  console.log(`  email:        ${emp.email}`);
  console.log(`  link (also emailed): ${link}`);
  console.log("\nDELETE .env.bootstrap NOW.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
