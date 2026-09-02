"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { sendResetPasswordEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
});

/**
 * Send a password-reset link to `email`.
 *
 * Privacy contract: we always return `{ok:true}` once the address is
 * well-formed, regardless of whether it's registered. The client renders
 * "Check your inbox" so attackers can't enumerate accounts. For malformed
 * input the client validates first and never calls this — but if it slips
 * through we still return ok to avoid a separate code path.
 *
 * Failure modes we DO surface (in server logs only):
 *  - Firebase/Resend errors: operator action needed.
 *  - Unregistered email: silently no-op (no log).
 */
export async function requestPasswordReset(
  emailInput: string,
): Promise<{ ok: true }> {
  const parsed = RequestSchema.safeParse({ email: emailInput });
  if (!parsed.success) {
    return { ok: true };
  }
  const email = parsed.data.email;

  try {
    const link = await getFirebaseAdminAuth().generatePasswordResetLink(email, {
      url: `${siteUrl()}/login`,
    });

    // Look up the recipient name so the email can greet them by first
    // name. Best-effort: if the employees row is missing (Firebase user
    // exists but no app row — shouldn't happen in normal flows) we just
    // send without a name and the template falls back to a generic title.
    const recipient = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.email, email))
      .limit(1);
    const recipientName = recipient[0]?.name;

    const { error } = await sendResetPasswordEmail({
      email,
      resetLink: link,
      recipientName,
    });
    if (error) {
      console.error(
        `[requestPasswordReset] sendResetPasswordEmail failed for ${email}: ${error}`,
      );
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found" || code === "auth/email-not-found") {
      return { ok: true };
    }
    console.error(
      `[requestPasswordReset] unexpected failure for ${email}:`,
      err,
    );
  }
  return { ok: true };
}
