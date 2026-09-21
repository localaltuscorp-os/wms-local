import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, type CandidateLinkPurpose } from "@/db/schema";
import { siteUrl } from "@/lib/site-url";
import { sendPlainEmail } from "@/lib/email/resend";
import { ACCESS_LINK_TTL_DAYS } from "@/lib/hr/candidate/access-link";
import { formatDateHr } from "@/lib/format";

/**
 * Mail a candidate their access link.
 *
 * THE ADDRESS IS READ FROM THE RECORD, NEVER PASSED IN. Every caller has an
 * intake id, not an email — including the public "email me my link again" page,
 * where accepting a caller-supplied address would turn the endpoint into a way
 * to have somebody else's link delivered to your own inbox. The only address
 * this function will ever send to is the one already on the candidate's row.
 *
 * NEVER THROWS. The two callers are a public page that must not vary its
 * response (app/c/resume/actions.ts) and candidate creation in the HR screen,
 * where a mail failure must not roll back a candidate that was otherwise created
 * — HR can resend from the screen. The boolean is for the HR screen's "Sent ✓".
 */
export async function sendCandidateAccessLink(
  intakeId: string,
  token: string,
  expiresAt: Date,
  purpose: CandidateLinkPurpose = "form",
  /**
   * Extra recipients HR typed in the send dialog. The candidate's OWN address is
   * still read from their record and always receives it; these are added on top
   * (HR's choice, in HR's gated dialog — never reachable from a public page).
   */
  extra: { to?: string[]; cc?: string[]; bcc?: string[] } = {},
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ email: candidateIntake.email, fullName: candidateIntake.fullName })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, intakeId))
      .limit(1);
    if (!row?.email) return false;

    // The token appears in this URL and nowhere else. `/c/<token>` swaps it for
    // an HttpOnly cookie on first open — see access-link-cookie.ts.
    const link = `${siteUrl()}/c/${encodeURIComponent(token)}`;
    const name = (row.fullName ?? "").trim().split(/\s+/)[0] || "there";
    // DD-MMM-YYYY, the one date form the HR module uses - including in mail.
    const expires = formatDateHr(expiresAt);

    // The two errands read differently to the person receiving them: one asks
    // for their details, the other asks them to read and sign. A single generic
    // mail would make the policies look optional.
    const policies = purpose === "policies";
    const onboarding = purpose === "onboarding";

    const ownEmail = row.email.toLowerCase();
    const res = await sendPlainEmail({
      to: [row.email, ...(extra.to ?? []).filter((e) => e.toLowerCase() !== ownEmail)],
      cc: extra.cc,
      bcc: extra.bcc,
      subject: policies
        ? "Policies to read and sign — Altus Corp"
        : onboarding
          ? "Your Altus Corp onboarding form"
          : "Your Altus Corp candidate form",
      // Plain text on purpose: this goes to a personal address, often read on a
      // phone, and it needs to survive every mail client without a template.
      text: [
        `Hi ${name},`,
        ``,
        ...(policies
          ? [
              `Please read and sign our company policies here — no account or`,
              `password needed:`,
            ]
          : onboarding
          ? [
              `Please fill in your joining (onboarding) details and attach your`,
              `documents here — no account or password needed:`,
            ]
          : [
              `You can fill in your details here — no account or password needed:`,
            ]),
        ``,
        link,
        ``,
        policies
          ? `The same link lets you come back later and change what you signed.`
          : `The same link lets you come back later and check what you submitted.`,
        `It works until ${expires}. If it stops working, request a new one at`,
        `${siteUrl()}/c/resume`,
        ``,
        `This link is personal to you — please don't forward it.`,
        ``,
        `— Altus Corp HR`,
      ].join("\n"),
    });
    if (res.error) {
      // LOG THE REAL REASON. HR's screen says only "couldn't email" — correct,
      // because the reason is server configuration and no candidate-facing
      // surface should narrate it. But swallowing it entirely meant a dead
      // RESEND_API_KEY looked identical to a bad address, and the only way to
      // tell them apart was to probe the Resend API by hand. One line here
      // turns that investigation into reading the log.
      console.warn(`[candidate-link] email not sent (${purpose}): ${res.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[candidate-link] email threw (${purpose}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** Re-exported so callers can tell the candidate how long it lasts without
 *  importing two modules. */
export { ACCESS_LINK_TTL_DAYS };
