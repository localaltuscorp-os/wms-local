import { getResend, FROM, companyBcc, clampSubject } from "./resend";
import { HR_CONTACT } from "@/lib/hr/firm";

/**
 * HR LETTER - "Export & Email PDF" sender. Emails a rendered HR-letter PDF to the
 * candidate/employee as an attachment, with a copy to the HR desk (HR_CONTACT.email
 * as CC) plus the company archive (companyBcc). Raw-HTML Resend body (same isolated
 * pattern as hr-recruiter-email.ts / report-emails.ts), on brand. Never throws;
 * no-ops gracefully when Resend is unconfigured (returns { ok:false, skipped:true }).
 */

const BRAND = "#E10600";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

function shell(title: string, sub: string, inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">${esc(sub)}</div>
      <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">${esc(title)}</h1>
    </div>
    ${inner}
    <p style="margin-top:24px;color:#999;font-size:11px">This email was sent from the Altus Corp Dashboard. For any questions, reply to this email or contact the HR desk at ${esc(HR_CONTACT.email)}.</p>
  </div>`;
}

/**
 * Email a rendered HR-letter PDF to its recipient, copying the HR desk.
 *
 * @returns `{ ok, skipped? }` - `skipped` when Resend is unconfigured (dev).
 */
export async function sendLetterPdfEmail(args: {
  to: string;
  recipientName?: string;
  letterTitle: string;
  entityName: string;
  pdf: Buffer;
  filename: string;
  /** Overrides the default "<title> - <entity>" subject (the composer's field). */
  subject?: string;
  /** Optional free-text note from the sender, shown above the standard body. */
  message?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { ok: false, skipped: true };

    const firstName = args.recipientName?.trim().split(/\s+/)[0];
    const greeting = firstName ? `Hi ${esc(firstName)},` : "Hello,";
    // The sender's optional note, kept as authored - escaped, with blank lines
    // turned into paragraphs so a multi-line message doesn't collapse to one run.
    const note = (args.message ?? "").trim();
    const noteHtml = note
      ? note
          .split(/\n{2,}/)
          .map((para) => `<p style="font-size:14px;margin:0 0 14px">${esc(para).replace(/\n/g, "<br />")}</p>`)
          .join("")
      : "";
    const inner = `<p style="font-size:14px;margin:0 0 14px">${greeting}</p>
      ${noteHtml}
      <p style="font-size:14px;margin:0 0 14px">Please find attached your <b>${esc(args.letterTitle)}</b> from <b>${esc(args.entityName)}</b>. The document is attached to this email as a PDF.</p>
      <p style="font-size:12.5px;color:#666;margin-top:10px">Kindly review the attached letter and reach out to the HR team for any questions.</p>`;

    // Copy the HR desk explicitly (record), plus the company archive via BCC.
    const cc = HR_CONTACT.email ? [HR_CONTACT.email] : undefined;

    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      ...(cc ? { cc } : {}),
      subject: clampSubject(args.subject?.trim() || `${args.letterTitle} - ${args.entityName}`),
      html: shell(args.letterTitle, args.entityName, inner),
      attachments: [{ filename: args.filename, content: args.pdf }],
      ...companyBcc(),
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
