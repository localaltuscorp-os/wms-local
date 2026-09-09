import "server-only";
import { Resend } from "resend";
import {
  AttendanceConfirmRequestEmail,
  type AttendanceConfirmRow,
} from "@/emails/notifications/AttendanceConfirmRequest";
import {
  PmsQuarterlyReportEmail,
  type PmsPillarLine,
} from "@/emails/notifications/PmsQuarterlyReport";
import { isDispatchV2On, isDispatchV2DryRun } from "@/lib/dispatch/flag";

/**
 * WS-7 · self-contained Resend senders for the two dispatch emails.
 *
 * Kept OUT of `lib/email/resend.ts` (a hot, team-shared file) so this slice
 * can land inert without touching existing senders. Mirrors that file's
 * conventions: reads env at call time, never throws, no-ops without a key.
 *
 * DOUBLE-GATED: even if a caller forgets, these return `{ skipped: true }`
 * unless DISPATCH_V2=on. With DISPATCH_V2_DRY_RUN=on the send is built but not
 * transmitted (returns `{ dryRun: true }`) so recipient lists can be verified.
 */

let cached: Resend | null = null;
function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

const FROM =
  process.env.RESEND_FROM_EMAIL || "Altus Corp Dashboard <onboarding@resend.dev>";

function companyBcc(): { bcc?: string[] } {
  const raw = process.env.EMAIL_BCC_ADDRESS?.trim();
  if (!raw) return {};
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? { bcc: list } : {};
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export type DispatchEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; skipped?: true; dryRun?: true; error?: string };

/** Common guard shared by both senders. Returns a terminal result to short
 *  the caller, or null when it's clear to actually transmit. */
function preflight(): DispatchEmailResult | null {
  if (!isDispatchV2On()) return { sent: false, skipped: true };
  if (isDispatchV2DryRun()) return { sent: false, dryRun: true };
  const resend = getResend();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };
  return null;
}

const SUBJECT_MAX = 80;
function clampSubject(s: string): string {
  const t = s.trim();
  return t.length <= SUBJECT_MAX ? t : `${t.slice(0, SUBJECT_MAX - 1)}…`;
}

/* ------------------------------------------------------------------ */
/* Monday attendance-confirmation request (WS-5)                        */
/* ------------------------------------------------------------------ */

export async function sendAttendanceConfirmRequestEmail(args: {
  recipient: { email: string; name: string };
  scopeLabel: string;
  weekLabel: string;
  rows: AttendanceConfirmRow[];
  approveUrl: string;
  siteUrl: string;
}): Promise<DispatchEmailResult> {
  const gate = preflight();
  if (gate) return gate;
  try {
    const resend = getResend()!;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        `Confirm ${args.scopeLabel}'s attendance — ${args.weekLabel} — Altus Corp`,
      ),
      react: AttendanceConfirmRequestEmail({
        recipientName: args.recipient.name,
        scopeLabel: args.scopeLabel,
        weekLabel: args.weekLabel,
        rows: args.rows,
        approveUrl: args.approveUrl,
        siteUrl: args.siteUrl,
      }),
      ...companyBcc(),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    return { sent: false, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Quarterly PMS report (WS-7)                                          */
/* ------------------------------------------------------------------ */

export async function sendPmsQuarterlyReportEmail(args: {
  recipient: { email: string; name: string };
  quarterLabel: string;
  overallScore: number;
  bandLabel: string;
  pillars: PmsPillarLine[];
  siteUrl: string;
}): Promise<DispatchEmailResult> {
  const gate = preflight();
  if (gate) return gate;
  try {
    const resend = getResend()!;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        `Your ${args.quarterLabel} performance report — Altus Corp`,
      ),
      react: PmsQuarterlyReportEmail({
        recipientName: args.recipient.name,
        quarterLabel: args.quarterLabel,
        overallScore: args.overallScore,
        bandLabel: args.bandLabel,
        pillars: args.pillars,
        siteUrl: args.siteUrl,
      }),
      ...companyBcc(),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    return { sent: false, error: errorMessage(err) };
  }
}
