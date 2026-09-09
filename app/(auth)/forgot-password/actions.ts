"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { sendResetPasswordEmail } from "@/lib/email/resend";
import { siteUrl, rehostActionLink } from "@/lib/site-url";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
});

/**
 * The two things the client is allowed to know.
 *
 * `ok: true`  → we did everything on our side: either a link is on its way, OR
 *               the address simply isn't registered. THE CLIENT CANNOT TELL
 *               THESE APART, and that is the point (see the privacy contract
 *               below). Both render "Check your inbox".
 * `ok: false` → OUR side is broken — email provider down, mis-configured, or an
 *               unexpected Firebase error. Safe to reveal because it is
 *               ACCOUNT-INDEPENDENT: it happens the same way whether or not the
 *               address exists, so it leaks nothing about who has an account.
 */
export type ResetResult = { ok: true } | { ok: false; error: string };

/**
 * Send a password-reset link to `email`.
 *
 * ── PRIVACY CONTRACT (unchanged) ───────────────────────────────────────────
 * A registered address and an unregistered one return the SAME `{ok:true}`, so
 * a stranger at the public login page cannot use this endpoint to discover who
 * has an account. `auth/user-not-found` is therefore swallowed on purpose.
 *
 * ── WHAT CHANGED, AND WHY ──────────────────────────────────────────────────
 * Previously this returned `{ok:true}` for EVERY outcome — including a missing
 * `RESEND_API_KEY` or a thrown Firebase admin error. The form then showed
 * "Check your inbox" over a system that had sent nothing, and the only trace was
 * a server log. Someone doing exactly the right thing waited forever for a mail
 * that never left the building.
 *
 * That is the actual failure behind "it says sent but no mail comes". Now an
 * operational failure returns `{ok:false}` and the form says so. The enumeration
 * guarantee is untouched: only account-INDEPENDENT failures surface, and "this
 * address isn't registered" still looks identical to success.
 */
export async function requestPasswordReset(emailInput: string): Promise<ResetResult> {
  const parsed = RequestSchema.safeParse({ email: emailInput });
  if (!parsed.success) {
    // Malformed input is not an operational failure and not an account signal —
    // the client already validates, so treat a straggler as the neutral case.
    return { ok: true };
  }
  const email = parsed.data.email;

  let link: string;
  try {
    link = rehostActionLink(
      await getFirebaseAdminAuth().generatePasswordResetLink(email, {
        url: `${siteUrl()}/login`,
      }),
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // The ONLY swallowed case: the address has no account. Silent by design.
    if (code === "auth/user-not-found" || code === "auth/email-not-found") {
      return { ok: true };
    }
    // Anything else is our problem — a bad service-account key, a Firebase
    // outage, a malformed continue URL. Account-independent, so safe to admit.
    console.error(`[requestPasswordReset] link generation failed for ${email}:`, err);
    return {
      ok: false,
      error: "We couldn't start the reset just now. Please try again in a minute.",
    };
  }

  // Best-effort greeting name. A missing employees row (Firebase user with no
  // app row) is not fatal — the template falls back to a generic title.
  const recipient = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);

  const { error } = await sendResetPasswordEmail({
    email,
    resetLink: link,
    recipientName: recipient[0]?.name,
  });
  if (error) {
    // The link was generated (so the account exists) but the email did not go
    // out — provider error or missing RESEND_API_KEY. Surfacing "send failed"
    // here reveals nothing an attacker could use: a non-existent account would
    // already have returned above, at link generation.
    console.error(`[requestPasswordReset] sendResetPasswordEmail failed for ${email}: ${error}`);
    return {
      ok: false,
      error: "We generated your reset link but couldn't email it. Please try again, or tell the team.",
    };
  }

  return { ok: true };
}
