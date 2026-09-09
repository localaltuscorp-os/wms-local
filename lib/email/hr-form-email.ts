import { getResend, FROM, companyBcc, clampSubject } from "./resend";
import { HR_CONTACT, hrDeskEmail } from "@/lib/hr/firm";

/**
 * FILLED HR FORM — "Mail" sender. Emails a completed form as a PDF attachment,
 * copying the HR desk and the company archive.
 *
 * This sits on the SHARED email infrastructure (`./resend` — client, FROM,
 * companyBcc, clampSubject) and follows the same one-module-per-feature pattern
 * that `hr-letter-email.ts` documents for itself ("same isolated pattern as
 * hr-recruiter-email.ts / report-emails.ts"). It is not a second email system.
 *
 * It is deliberately NOT `sendLetterPdfEmail`: that one's copy is letter-shaped
 * ("your <title> from <paying entity>… review the attached letter"), and a form
 * has no issuing entity and isn't a letter. Reusing it would have meant sending
 * employees wrong wording to save a file.
 *
 * Never throws; no-ops gracefully when Resend is unconfigured (dev), returning
 * `{ ok: false, skipped: true }` so callers can say so instead of claiming a
 * send that never happened.
 */

const BRAND = "#E10600";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

export async function sendHrFormPdfEmail(args: {
  to: string;
  recipientName?: string;
  formName: string;
  sectionLabel: string;
  /** Pre-formatted submission date, or the draft's last-saved date. */
  submittedOn: string;
  status: "draft" | "submitted";
  pdf: Buffer;
  filename: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { ok: false, skipped: true };

    const firstName = args.recipientName?.trim().split(/\s+/)[0];
    const greeting = firstName ? `Hi ${esc(firstName)},` : "Hello,";
    // A draft is explicitly labelled — an unfinished form landing in someone's
    // inbox looking final is how half-filled paperwork gets acted on.
    const stateLine =
      args.status === "submitted"
        ? `submitted on <b>${esc(args.submittedOn)}</b>`
        : `saved as a <b>draft</b> on <b>${esc(args.submittedOn)}</b> and not yet submitted`;

    const inner = `<p style="font-size:14px;margin:0 0 14px">${greeting}</p>
      <p style="font-size:14px;margin:0 0 14px">Attached is a copy of the <b>${esc(args.formName)}</b> form (${esc(
        args.sectionLabel,
      )}), ${stateLine}.</p>
      <p style="font-size:12.5px;color:#666;margin-top:10px">The completed responses are in the attached PDF. Reach out to the HR team with any questions.</p>`;

    // Copy the HR desk — UNLESS it is already the recipient. The submit-time
    // send addresses HR directly, and a message with the same address in both
    // To and Cc reads like a mistake (and some clients thread it oddly).
    //
    // The DELIVERY address, so a staging deploy's override applies. The address
    // printed in the footer below stays HR_CONTACT.email: that is the published
    // contact people should write to, not wherever this copy happens to land.
    const hrDesk = hrDeskEmail();
    const cc =
      hrDesk && hrDesk.trim().toLowerCase() !== args.to.trim().toLowerCase()
        ? [hrDesk]
        : undefined;

    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      ...(cc ? { cc } : {}),
      subject: clampSubject(`${args.formName} — ${args.recipientName ?? "Filled form"}`),
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">${esc(
            args.sectionLabel,
          )}</div>
          <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">${esc(args.formName)}</h1>
        </div>
        ${inner}
        <p style="margin-top:24px;color:#999;font-size:11px">This email was sent from the Altus Corp Dashboard. For any questions, reply to this email or contact the HR desk at ${esc(
          HR_CONTACT.email,
        )}.</p>
      </div>`,
      attachments: [{ filename: args.filename, content: args.pdf }],
      ...companyBcc(),
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
