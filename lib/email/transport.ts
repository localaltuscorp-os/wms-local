import "server-only";
import type { ReactElement } from "react";
import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

type Address = string | string[];

export interface EmailSendInput {
  from: string;
  to: Address;
  cc?: Address;
  bcc?: Address;
  replyTo?: Address;
  subject: string;
  text?: string;
  html?: string;
  react?: ReactElement;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
    contentId?: string;
  }>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface EmailClient {
  emails: {
    send(input: EmailSendInput): Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>;
  };
}

let smtpTransport: Transporter | null = null;
let resendClient: Resend | null = null;
let sharedClient: EmailClient | null = null;

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS,
  );
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return smtpTransport;
}

function getResendClient(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY!.trim());
  return resendClient;
}

async function smtpSend(input: EmailSendInput): Promise<{ id: string }> {
  const html = input.html ?? (input.react ? await render(input.react) : undefined);
  const info = await getSmtpTransport().sendMail({
    from: process.env.SMTP_FROM_EMAIL?.trim() || input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html,
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      path: attachment.path,
      contentType: attachment.contentType,
      cid: attachment.contentId,
    })),
    headers: input.headers,
  });
  return { id: String(info.messageId || `smtp-${Date.now()}`) };
}

async function resendSend(input: EmailSendInput) {
  return getResendClient().emails.send(input as Parameters<Resend["emails"]["send"]>[0]);
}

/**
 * Shared server mail client. SMTP is primary when fully configured; Resend is
 * the fallback. With no SMTP configuration, existing Resend behaviour remains.
 *
 * A failed SMTP command can be ambiguous if the remote server accepted the
 * message immediately before the connection failed. Falling back improves
 * delivery, but providers should use a short timeout and callers should tolerate
 * the rare possibility of a duplicate message.
 */
export function getEmailClient(): EmailClient | null {
  if (!smtpConfigured() && !resendConfigured()) return null;
  if (sharedClient) return sharedClient;

  sharedClient = {
    emails: {
      async send(input) {
        if (smtpConfigured()) {
          try {
            const data = await smtpSend(input);
            return { data, error: null };
          } catch (smtpError) {
            if (!resendConfigured()) {
              return {
                data: null,
                error: { message: smtpError instanceof Error ? smtpError.message : String(smtpError) },
              };
            }
            console.warn("[email] SMTP delivery failed; trying Resend fallback.");
          }
        }

        const result = await resendSend(input);
        return {
          data: result.data ? { id: result.data.id } : null,
          error: result.error ? { message: result.error.message } : null,
        };
      },
    },
  };
  return sharedClient;
}

