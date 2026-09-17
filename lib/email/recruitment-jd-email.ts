import "server-only";
import { getResend, FROM, companyBcc, clampSubject, errorMessage } from "./resend";
import { jdEmailHtml, jdEmailSubject, type JdContent } from "@/lib/operations/recruitment-jd";

/**
 * Email a Recruitment JD to anyone (lib/operations/recruitment-jd.ts builds the body).
 * The company archive is BCC'd, as on every HR send. Never throws.
 */
export async function sendRecruitmentJdEmail(args: {
  to: string;
  recipientName?: string | null;
  note?: string | null;
  content: JdContent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resend = getResend();
    if (!resend) return { ok: false, error: "Email isn't configured on this server." };
    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(jdEmailSubject(args.content)),
      html: jdEmailHtml(args.content, { recipientName: args.recipientName, note: args.note }),
      ...companyBcc(),
    });
    if (error) return { ok: false, error: errorMessage(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
