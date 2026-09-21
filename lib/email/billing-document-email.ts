import "server-only";
import { getResend, FROM, companyBcc, clampSubject, errorMessage } from "./resend";

/**
 * BILLING — "email this document" sender.
 *
 * Shaped exactly like lib/email/hr-letter-email.ts (the repo's existing
 * "email a generated PDF" pattern): a raw-HTML branded shell, the PDF as an
 * attachment, the company archive BCC'd. It never throws — an unconfigured
 * Resend key surfaces as a clean "Email is not configured" for the UI to show,
 * because a billing screen crashing on a missing env var helps nobody.
 */

const BRAND = "#E10600";
/** Content-ID of the invoice picture embedded in the body. */
const DOC_IMAGE_CID = "invoice-page";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** The user's plain-text body, kept as authored: blank lines become paragraphs,
 *  single newlines become breaks. Nothing is reworded on the way out. */
function bodyHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="font-size:14px;line-height:1.55;margin:0 0 14px">${esc(para).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function shell(title: string, sub: string, inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">${esc(sub)}</div>
      <h1 style="margin:6px 0 2px;font-size:20px;font-weight:800">${esc(title)}</h1>
    </div>
    ${inner}
    <p style="margin-top:24px;color:#999;font-size:11px">The document referred to above is attached to this email as a PDF.</p>
  </div>`;
}

export interface SendInvoiceEmailArgs {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** The plain-text body as the user approved it in the composer. */
  body: string;
  /** Printed above the body as the email's own heading. */
  title: string;
  companyName: string;
  pdf: Buffer;
  filename: string;
  /** The document itself rendered as email HTML (lib/billing/invoice-email-html),
   *  shown under the message so the customer sees it without opening the PDF. */
  documentHtml?: string;
  /** Page one of the PDF as a PNG. When present it is embedded in the body
   *  (inline, cid:) under the message — the exact template — and replaces
   *  `documentHtml`, which remains the fallback. */
  documentImage?: Buffer;
}

/**
 * Resend's raw refusal ("The x.com domain is not verified. Please, add and
 * verify your domain on https://resend.com/domains") means nothing to the
 * person pressing Confirm. Say what is wrong and who fixes it instead.
 */
function friendlySendError(message: string): string {
  const unverified = /The (\S+) domain is not verified/i.exec(message);
  if (unverified) {
    return `Email could not be sent: the sending address (${FROM.replace(/^.*</, "").replace(/>$/, "")}) is not set up in the Resend account this app uses. An admin needs to verify ${unverified[1]} in Resend, or give the app the API key of the Resend account where it is verified.`;
  }
  if (/api key is invalid/i.test(message)) {
    return "Email could not be sent: the Resend API key this app uses is not valid. An admin needs to replace RESEND_API_KEY.";
  }
  return `Email could not be sent: ${message}`;
}

export async function sendInvoiceEmail(
  args: SendInvoiceEmailArgs,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resend = getResend();
    if (!resend) {
      return {
        ok: false,
        error: "Email is not configured on this environment (RESEND_API_KEY is not set).",
      };
    }

    const archive = companyBcc();
    const bcc = [...(args.bcc ?? []), ...(archive.bcc ?? [])];

    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      ...(args.cc && args.cc.length > 0 ? { cc: args.cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      subject: clampSubject(args.subject),
      html: shell(
        args.title,
        args.companyName,
        // The message IS the invoice: its picture as the body. Only if the
        // picture could not be made does the written letter + HTML invoice
        // stand in. The letter always travels as the plain-text part.
        args.documentImage
          ? `<img src="cid:${DOC_IMAGE_CID}" alt="${esc(args.title)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:1px solid #e2e8f0;margin:0 0 12px" />`
          : bodyHtml(args.body) + (args.documentHtml ?? ""),
      ),
      text: args.body,
      attachments: [
        { filename: args.filename, content: args.pdf },
        ...(args.documentImage
          ? [{ filename: "invoice.png", content: args.documentImage, contentId: DOC_IMAGE_CID }]
          : []),
      ],
    });
    if (error) return { ok: false, error: friendlySendError(error.message) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
