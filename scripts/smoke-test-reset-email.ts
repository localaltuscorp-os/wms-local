/**
 * Real Resend smoke test.
 *
 * Generates a Firebase password-reset link for the given email and
 * sends our actual ResetPasswordEmail template via Resend. Verifies:
 *   - RESEND_API_KEY is valid AND can send from the configured FROM
 *   - Our React Email template renders without crashing
 *   - The reset link round-trips through Firebase
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/smoke-test-reset-email.ts <email>
 *
 * Note: this script bypasses `lib/email/resend.ts` and `lib/firebase/admin.ts`
 * because those modules use `import "server-only"`, which throws when imported
 * from a CLI. We inline the same SDK calls — only the React Email template is
 * shared, which is the part we actually want to test.
 *
 * Privacy: this DOES reveal whether the email is registered (Firebase throws
 * auth/user-not-found). Dev tool — not exposed in the app.
 */
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";
import { ResetPasswordEmail } from "../emails/reset-password";

async function main() {
  const emailArg = process.argv[2];
  if (!emailArg) {
    console.error("Usage: pnpm tsx --env-file=.env.local scripts/smoke-test-reset-email.ts <email>");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[smoke] RESEND_API_KEY is not set");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error("[smoke] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
    process.exit(1);
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";
  const from = process.env.RESEND_FROM_EMAIL ?? "Altus Corp Dashboard <onboarding@resend.dev>";

  console.log(`[smoke] generating reset link for ${email} (continue at ${siteUrl}/login)`);
  let link: string;
  try {
    link = await auth.generatePasswordResetLink(email, { url: `${siteUrl}/login` });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found" || code === "auth/email-not-found") {
      console.error(`[smoke] no Firebase user for ${email} — invite them first via /admin/employees, or use a registered address.`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`[smoke] link generated (${link.length} chars):`);
  console.log(`        ${link.slice(0, 100)}...`);

  const recipientRow = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);
  const recipientName = recipientRow[0]?.name;
  console.log(`[smoke] recipient name in DB: ${recipientName ?? "(no employees row — sending without name)"}`);

  console.log(`[smoke] sending via Resend (from: ${from}) …`);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: "Reset your Altus Corp password",
    react: ResetPasswordEmail({ link, recipientName }),
  });
  if (error) {
    console.error(`[smoke] FAILED: ${error.message}`);
    process.exit(1);
  }
  console.log(`[smoke] OK — Resend message id: ${data?.id ?? "(unknown)"}`);
  console.log(`[smoke] check ${email}'s inbox.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] unexpected failure:", err);
  process.exit(1);
});
