import "server-only";
import { clampSubject, companyBcc, errorMessage, FROM, getResend } from "./resend";

/**
 * Send one 10 PM DCC report. The HTML is built by lib/dcc/daily-report.ts; this
 * only delivers it. Never throws: the cron sends many of these in a row, and one
 * bad address must not stop the rest.
 *
 * The subject is clamped to the app-wide limit, so a long name can shorten the
 * subject but never break the send.
 */
export async function sendDccDailyReportEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string | null; error: string | null }> {
  const resend = getResend();
  if (!resend) return { id: null, error: "Email is not configured (no RESEND_API_KEY)." };
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(args.subject),
      html: args.html,
      ...companyBcc(),
    });
    if (error) return { id: null, error: errorMessage(error) };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}
