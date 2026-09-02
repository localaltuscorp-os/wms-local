import "server-only";
import { getResend, FROM, companyBcc, clampSubject, errorMessage } from "./resend";

/**
 * Onboarding-invite email — the warm "please complete your Onboarding Form"
 * nudge sent to every employee who hasn't submitted yet. Kept in its own module
 * (like report-emails.ts) so it renders a simple branded HTML body rather than a
 * React-Email component. No-ops silently when Resend is unconfigured.
 *
 * HARD RULE: the form link is the PUBLIC PROD url, hardcoded — an email link
 * must NEVER be a localhost/preview host, so we do not derive it from siteUrl().
 */

type SendResult = { id: string | null; error: string | null };

const BRAND = "#E10600";
const BRAND_DEEP = "#A80400";

/** The canonical public onboarding form URL — hardcoded, never localhost. */
export const ONBOARDING_URL = "https://wms.mananvasa.com/dossier/onboarding";

/** The documents the form collects — surfaced in the email so people arrive ready. */
const DOC_CHECKLIST = [
  "Aadhaar card",
  "PAN card",
  "Passport-size photo",
  "Cancelled cheque (for salary account)",
  "Previous employment proof",
] as const;

function onboardingInviteHtml(recipientName: string): string {
  const first = recipientName.split(" ")[0] || recipientName;
  const items = DOC_CHECKLIST.map(
    (d) =>
      `<li style="margin:0 0 8px;padding:0;font-size:14px;line-height:1.5;color:#1a1a1a">${d}</li>`,
  ).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Altus Corp</div>
      <h1 style="margin:6px 0 2px;font-size:23px;font-weight:800">Complete your Onboarding Form</h1>
      <div style="color:#666;font-size:14px">A few minutes now saves a lot later.</div>
    </div>

    <p style="font-size:14.5px;line-height:1.6;margin:0 0 14px">Hi ${first}, welcome aboard! Please take a moment to complete your <b>Onboarding Form</b> so we can set up your records, payroll, and workspace without any back-and-forth.</p>

    <p style="margin:22px 0"><a href="${ONBOARDING_URL}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">Fill your Onboarding Form →</a></p>

    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px 16px;margin:18px 0">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#9a3412;margin-bottom:8px">Keep these handy</div>
      <ul style="margin:0;padding:0 0 0 18px">${items}</ul>
    </div>

    <p style="font-size:13px;line-height:1.6;color:#555;margin:14px 0 0">If the button doesn't work, copy this link into your browser:<br/>
      <a href="${ONBOARDING_URL}" style="color:${BRAND_DEEP};font-weight:600">${ONBOARDING_URL}</a>
    </p>

    <p style="margin-top:24px;color:#999;font-size:11px">This is an automated message from the Altus Corp Dashboard. If you've already submitted your form, you can ignore this.</p>
  </div>`;
}

/**
 * Send ONE onboarding-invite email. Best-effort, never throws — returns
 * `{ error }` so the caller can count failures. Silently no-ops (returns
 * `{ id: null, error: null }`) when Resend is unconfigured. `siteUrl` is accepted
 * for signature symmetry with the other senders but is NOT used for the form
 * link, which is always the hardcoded public prod URL.
 */
export async function sendOnboardingInviteEmail(args: {
  recipient: { email: string; name: string };
  siteUrl?: string;
}): Promise<SendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject("Complete your Onboarding Form — Altus Corp"),
      html: onboardingInviteHtml(args.recipient.name),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}
