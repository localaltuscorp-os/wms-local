import "server-only";
import type { ReactElement } from "react";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { employees, notifications, tasks } from "@/db/schema";
import type { NotificationKind } from "@/db/schema";
import { InviteEmail } from "@/emails/invite";
import { ResetPasswordEmail } from "@/emails/reset-password";
import { CredentialsInviteEmail } from "@/emails/credentials-invite";
import { WelcomeOfficialEmail } from "@/emails/welcome-official";
import { AdminResetPasswordEmail } from "@/emails/admin-reset-password";
import { TaskAssignedEmail } from "@/emails/notifications/TaskAssigned";
import { TaskInitiatedEmail } from "@/emails/notifications/TaskInitiated";
import { StatusChangedEmail } from "@/emails/notifications/StatusChanged";
import { ApprovedEmail } from "@/emails/notifications/Approved";
import { DeclinedEmail } from "@/emails/notifications/Declined";
import { ReassignedEmail } from "@/emails/notifications/Reassigned";
import { TransferredEmail } from "@/emails/notifications/Transferred";
import { CancelledEmail } from "@/emails/notifications/Cancelled";
import { CommentedEmail } from "@/emails/notifications/Commented";
import { DailyDigestEmail } from "@/emails/notifications/DailyDigest";
import {
  TaskReminderDigestEmail,
  type TaskReminderGroup,
} from "@/emails/notifications/TaskReminderDigest";
import {
  WeeklyGoalsMondayEmail,
  type WeeklyGoalLine,
} from "@/emails/notifications/WeeklyGoalsMonday";
import { WeeklyGoalsFillReminderEmail } from "@/emails/notifications/WeeklyGoalsFillReminder";
import { WeeklyGoalsIncompleteEmail } from "@/emails/notifications/WeeklyGoalsIncomplete";
import { AttendanceLateEmail } from "@/emails/notifications/attendance-late";
import { AttendanceLateWaivedEmail } from "@/emails/notifications/attendance-late-waived";
import { AttendanceHalfDayEmail } from "@/emails/notifications/attendance-half-day";
import { AttendanceLateDeductionEmail } from "@/emails/notifications/attendance-late-deduction";
import { IncentiveDecisionEmail } from "@/emails/notifications/IncentiveDecision";
import {
  HrTicketNoticeEmail,
  ticketThreadUrl,
} from "@/emails/notifications/hr-ticket-notice";
import {
  IncentiveMonthlyDigestEmail,
  type IncentiveDigestEntry,
} from "@/emails/notifications/IncentiveMonthlyDigest";
import type {
  NotificationMeta,
  OverdueDigestTask,
  SendDigestEmailArgs,
} from "@/emails/notifications/types";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { type TaskStatus } from "@/db/enums";
import type { ChipTone } from "@/emails/notifications/_notification-layout";

// Centralized status display map → email ChipTone. Only the 6 tokens that
// have a matching ChipTone palette entry map through; everything else
// (raw hex, or the extended yellow/orange/slate/brown tokens) falls back to
// the legacy STATUS_TONE_MAP inside the template, since we can't synthesize
// a new ChipTone palette entry at render time.
const EMAIL_CHIP_TONES = ["blue", "green", "amber", "red", "rose", "purple"] as const;
function asChipTone(color: string): ChipTone | undefined {
  return (EMAIL_CHIP_TONES as readonly string[]).includes(color)
    ? (color as ChipTone)
    : undefined;
}

/* ------------------------------------------------------------------ */
/* Resend client + shared helpers                                      */
/* ------------------------------------------------------------------ */

let cached: Resend | null = null;

/**
 * Returns the Resend client when `RESEND_API_KEY` is set, else `null`.
 *
 * The original auth-flow senders (invite, reset-password) used to throw
 * on a missing key.  M2.3 broadens the contract: notification senders
 * must be safe to call in dev environments without Resend credentials,
 * so we never throw — callers check the `error`/`id` fields (or just
 * the `void` return for `sendNotificationEmail`) to know whether an
 * email actually went out.
 */
export function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export const FROM = process.env.RESEND_FROM_EMAIL || "Altus Corp Dashboard <onboarding@resend.dev>";

/**
 * D12 (WMS overhaul Phase 6) — company-record BCC. When `EMAIL_BCC_ADDRESS` is
 * set (comma-separated allowed), every piece of OUTGOING CORRESPONDENCE
 * (notifications, digests, weekly-goals planner mails) is blind-copied to the
 * company archive inbox so management has a durable record. Returns a spreadable
 * `{ bcc }` fragment, or `{}` when unconfigured (no-op). Deliberately NOT applied
 * to auth credential mails (invite / reset / password) — those carry secrets we
 * don't want archived.
 */
export function companyBcc(): { bcc?: string[] } {
  const raw = process.env.EMAIL_BCC_ADDRESS?.trim();
  if (!raw) return {};
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? { bcc: list } : {};
}

const SUBJECT_MAX = 80;

export function clampSubject(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= SUBJECT_MAX) return trimmed;
  return `${trimmed.slice(0, SUBJECT_MAX - 1)}…`;
}

export function digestSubject(pendingCount: number): string {
  if (pendingCount === 0) {
    return "You're all clear — no pending tasks — Altus Corp Dashboard";
  }
  const noun = pendingCount === 1 ? "task" : "tasks";
  return `You have ${pendingCount} pending ${noun} — Altus Corp Dashboard`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Parse the optional JSON meta payload that the dispatcher stores in
 * `notification.body`.  Falls back to `{ note: <body> }` so non-JSON
 * bodies (legacy / free-text) still render in templates that quote a
 * note (declined, cancelled, transferred, commented).
 */
function parseMeta(body: string | null): NotificationMeta {
  if (!body) return {};
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return { note: trimmed };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as NotificationMeta;
  } catch {
    // not JSON — treat the whole body as a note string
  }
  return { note: trimmed };
}

/* ------------------------------------------------------------------ */
/* Auth-flow senders (M2.0) — unchanged contract                       */
/* ------------------------------------------------------------------ */

export async function sendInviteEmail(args: {
  email: string;
  inviteeName: string;
  inviterName: string;
  inviteLink: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: "RESEND_API_KEY not set" };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject: `You've been invited to Altus Corp Dashboard`,
      react: InviteEmail({
        inviteeName: args.inviteeName,
        inviterName: args.inviterName,
        link:        args.inviteLink,
      }),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

export async function sendResetPasswordEmail(args: {
  email: string;
  resetLink: string;
  recipientName?: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: "RESEND_API_KEY not set" };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject: `Reset your Altus Corp password`,
      react: ResetPasswordEmail({
        link: args.resetLink,
        recipientName: args.recipientName,
      }),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

export async function sendCredentialsEmail(args: {
  email: string;
  inviteeName: string;
  inviterName: string;
  password: string;
  loginUrl: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: "RESEND_API_KEY not set" };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject: `Your Altus Corp Dashboard login details`,
      react: CredentialsInviteEmail({
        inviteeName: args.inviteeName,
        inviterName: args.inviterName,
        email: args.email,
        password: args.password,
        loginUrl: args.loginUrl,
      }),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/**
 * Post-joining WELCOME email — sent to the employee's PERSONAL inbox when HR
 * provisions their official company email. Carries the official address, their
 * dashboard login credentials (password only when a fresh one was minted), and
 * a short induction guide. Fail-soft + no-ops silently when Resend is unset, so
 * it can never block the provisioning action. Sensitive: the caller must pass
 * the employee's OWN personal/account email only.
 */
export async function sendWelcomeEmail(args: {
  /** The employee's personal (or account) email — the ONLY recipient. */
  email: string;
  employeeName: string;
  officialEmail: string;
  loginEmail: string;
  password?: string | null;
  loginUrl: string;
  hrEmail: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject: `Welcome to Altus Corp — your official email is ready`,
      react: WelcomeOfficialEmail({
        employeeName: args.employeeName,
        officialEmail: args.officialEmail,
        loginEmail: args.loginEmail,
        password: args.password ?? null,
        loginUrl: args.loginUrl,
        hrEmail: args.hrEmail,
      }),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

export async function sendPasswordChangedByAdminEmail(args: {
  email: string;
  recipientName?: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: "RESEND_API_KEY not set" };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.email,
      subject: `Your Altus Corp password was reset by an administrator`,
      react: AdminResetPasswordEmail({ recipientName: args.recipientName }),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* M2.3 — per-notification email                                        */
/* ------------------------------------------------------------------ */

/**
 * Back-compat alias for the stub-era `DigestOverdueTask` type.  Agent A's
 * stub exported this name; the cron route may rely on it.  Identical to
 * the canonical `OverdueDigestTask` in `emails/notifications/types.ts`.
 */
export type DigestOverdueTask = OverdueDigestTask;

/**
 * The shape `sendNotificationEmail` accepts.  Matches Agent A's call
 * site in `lib/notifications/dispatch.ts` — do not break this contract.
 */
export interface NotificationEmailInput {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  taskId: string | null;
}

/**
 * Renders and dispatches a per-notification email via Resend.
 *
 * Called by `lib/notifications/dispatch.ts` after a notifications row
 * is committed.  Resolves recipient email/name, actor name, and task
 * subject inside this function (one batched query) so the dispatcher
 * doesn't need to know about email-template field shapes.
 *
 * Resolution policy:
 *  - Recipient is looked up by `userId`.  If the employee is missing
 *    (defensive — FK should prevent this) we drop the email silently.
 *  - Actor name is looked up by reading the most-recent
 *    `notifications.actorId` for this row.  We DON'T re-query because
 *    the dispatcher might already have stashed actor context in the
 *    JSON `body` payload.
 *  - Task subject comes from `tasks.subject` (falling back to
 *    `tasks.title`) when `taskId` is set.  Missing task → "your task".
 *
 * Behavior:
 *  - Returns `void` — matches Agent A's signature.  The dispatcher
 *    wraps us in a try/catch and swallows errors so a Resend outage
 *    never blocks a Server Action mutation.
 *  - Silently skips when `RESEND_API_KEY` is unset (dev without Resend).
 *  - Silently skips for `overdue_digest` kinds — those are handled by
 *    `sendDigestEmail`.
 */
export async function sendNotificationEmail(
  n: NotificationEmailInput,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  // The dispatcher hands us the row by primary key fields only.  We
  // need a couple of joined facts to render: recipient identity, actor
  // identity, task subject, and the admin-configured status display
  // map. Resolve them in parallel. getStatusDisplayMap is React-cached,
  // so multiple emails in the same RSC tick share the lookup.
  const [recipient, taskRow, actorName, statusDisplay] = await Promise.all([
    resolveRecipient(n.userId),
    n.taskId ? resolveTaskSubject(n.taskId) : Promise.resolve(null),
    resolveActorNameFor(n.id),
    getStatusDisplayMap(),
  ]);

  if (!recipient) return;

  const template = renderNotificationTemplate({
    notification: n,
    recipient,
    actorName,
    taskSubject: taskRow ?? undefined,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    statusDisplay,
  });

  if (!template) return;

  await resend.emails.send({
    from: FROM,
    to: recipient.email,
    subject: clampSubject(n.title),
    react: template,
    ...companyBcc(),
  });
}

/**
 * Renders and dispatches the daily-digest overdue-tasks email.
 *
 * Signature is the contract published by the digest cron route
 * (`app/api/cron/digest/route.ts`).  Do not change it without
 * coordinating with that file.
 *
 * Returns `{ id: null, error: null }` and skips the send when the
 * recipient has zero overdue tasks (the cron also short-circuits).
 */
export async function sendDigestEmail(
  args: SendDigestEmailArgs,
): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(digestSubject(args.pendingTasks.length)),
      react: DailyDigestEmail({
        recipientName: args.recipient.name,
        pendingTasks:  args.pendingTasks,
        siteUrl:       args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Task Reminder Settings — admin-authored daily reminders              */
/* ------------------------------------------------------------------ */

/**
 * ONE consolidated reminder to ONE recipient, grouped by employee.
 *
 * Called once per recipient per rule by app/api/cron/task-reminders — never
 * once per task. See the template for why.
 */
export async function sendTaskReminderEmail(args: {
  recipient: { email: string; name: string };
  ruleName: string;
  groups: TaskReminderGroup[];
  totalTasks: number;
  siteUrl: string | undefined;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };

    const people = args.groups.length;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        `${args.ruleName}: ${args.totalTasks} open task${
          args.totalTasks === 1 ? "" : "s"
        } across ${people} ${people === 1 ? "person" : "people"}`,
      ),
      react: TaskReminderDigestEmail({
        recipientName: args.recipient.name,
        ruleName: args.ruleName,
        groups: args.groups,
        totalTasks: args.totalTasks,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Weekly Goals — planner cron emails                                   */
/* ------------------------------------------------------------------ */

type EmailSendResult = { id: string | null; error: string | null };

/** Monday 10:00 — the week's priorities (or a nudge to set some). */
export async function sendWeeklyGoalsMondayEmail(args: {
  recipient: { email: string; name: string };
  weekLabel: string;
  goals: WeeklyGoalLine[];
  siteUrl: string | undefined;
}): Promise<EmailSendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        args.goals.length > 0
          ? `Your ${args.goals.length} priorities for the week — Altus Corp`
          : `Set your weekly priorities — Altus Corp`,
      ),
      react: WeeklyGoalsMondayEmail({
        recipientName: args.recipient.name,
        weekLabel: args.weekLabel,
        goals: args.goals,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** Saturday 18:00 — reminder to fill in % done. */
export async function sendWeeklyGoalsFillReminderEmail(args: {
  recipient: { email: string; name: string };
  weekLabel: string;
  pendingCount: number;
  siteUrl: string | undefined;
}): Promise<EmailSendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject("Update your % done before the week closes — Altus Corp"),
      react: WeeklyGoalsFillReminderEmail({
        recipientName: args.recipient.name,
        weekLabel: args.weekLabel,
        pendingCount: args.pendingCount,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** Sunday + Monday 09:45 — escalation when goals are still unmarked. */
export async function sendWeeklyGoalsIncompleteEmail(args: {
  recipient: { email: string; name: string };
  weekLabel: string;
  unmarkedCount: number;
  siteUrl: string | undefined;
}): Promise<EmailSendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        `${args.unmarkedCount} weekly ${args.unmarkedCount === 1 ? "goal" : "goals"} still unmarked — Altus Corp`,
      ),
      react: WeeklyGoalsIncompleteEmail({
        recipientName: args.recipient.name,
        weekLabel: args.weekLabel,
        unmarkedCount: args.unmarkedCount,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Incentive — decision event + monthly digest                          */
/* ------------------------------------------------------------------ */

/**
 * Event email — sent when an admin approves/rejects an incentive REQUEST.
 * Best-effort: never throws; returns `{ error }` so the caller can log.
 * Silently no-ops (returns `{ id: null, error: null }`) when Resend is
 * unconfigured, so dev environments don't fail the decide action.
 */
export async function sendIncentiveDecisionEmail(args: {
  recipient: { email: string; name: string };
  typeLabel: string;
  verdict: "approved" | "rejected";
  detailPairs: Array<[string, string]>;
  note?: string | null;
  siteUrl: string | undefined;
}): Promise<EmailSendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(
        `Your ${args.typeLabel} incentive request was ${args.verdict} — Altus Corp`,
      ),
      react: IncentiveDecisionEmail({
        recipientName: args.recipient.name,
        typeLabel: args.typeLabel,
        verdict: args.verdict,
        detailPairs: args.detailPairs,
        note: args.note ?? null,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** Monthly digest — a recipient's incentive summary for the trailing period. */
export async function sendIncentiveMonthlyDigestEmail(args: {
  recipient: { email: string; name: string };
  periodLabel: string;
  approvedTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  recent: IncentiveDigestEntry[];
  siteUrl: string | undefined;
}): Promise<EmailSendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(`Your incentive summary for ${args.periodLabel} — Altus Corp`),
      react: IncentiveMonthlyDigestEmail({
        recipientName: args.recipient.name,
        periodLabel: args.periodLabel,
        approvedTotal: args.approvedTotal,
        paidTotal: args.paidTotal,
        unpaidTotal: args.unpaidTotal,
        recent: args.recent,
        siteUrl: args.siteUrl ?? "",
      }),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Enterprise Communications (ECOS, mig 0179) — broadcast email         */
/* ------------------------------------------------------------------ */

/** Escape a raw string for safe interpolation into our HTML shell. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BROADCAST_PRIORITY_BANNER: Record<
  string,
  { label: string; bg: string; fg: string } | undefined
> = {
  high: { label: "High priority", bg: "#FEF3C7", fg: "#92400E" },
  critical: { label: "Critical — action required", bg: "#FEE2E2", fg: "#991B1B" },
  emergency: { label: "Emergency", bg: "#7F1D1D", fg: "#FFFFFF" },
};

/**
 * Sends ONE official broadcast email. Unlike `sendNotificationEmail` (which
 * renders a per-task template and returns null for the `broadcast` kind), this
 * ships the broadcast's OWN authored HTML wrapped in a minimal branded shell.
 *
 * Best-effort: never throws; returns `{ error }` so the ECOS publish flow can
 * log per-recipient failures without aborting the fan-out. No-ops (returns
 * `{ id: null, error: null }`) when Resend is unconfigured (dev without a key).
 *
 * The email goes to the recipient's WORK inbox (the caller resolves and passes
 * `to`) — broadcasts are official company communications, so we do NOT fall
 * back to a personal address the way the onboarding welcome mail does.
 */
export async function sendBroadcastEmail(args: {
  /** The recipient's work email address (already resolved by the caller). */
  to: string;
  /** The broadcast title — becomes the subject line. */
  subject: string;
  /** The author-composed HTML body (sanitised upstream at compose time). */
  bodyHtml: string;
  /** Fallback plain text used when bodyHtml is empty. */
  bodyText?: string | null;
  /** Display name for the sender identity ("Altus HR", a CEO/Founder name). */
  senderLabel: string;
  /** One of BROADCAST_PRIORITIES — drives the optional priority banner. */
  priority?: string;
  /** Whether recipients must explicitly acknowledge (adds a CTA nudge). */
  requireAck?: boolean;
  broadcastId: string;
  siteUrl?: string | undefined;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };

    const site = (args.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const viewUrl = site ? `${site}/communications/${args.broadcastId}` : "";
    const banner = args.priority ? BROADCAST_PRIORITY_BANNER[args.priority] : undefined;
    const inner =
      args.bodyHtml && args.bodyHtml.trim().length > 0
        ? args.bodyHtml
        : `<p>${escapeHtml(args.bodyText ?? "").replace(/\n/g, "<br/>")}</p>`;

    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F3F4F6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
          <tr><td style="background:#0B1220;padding:18px 28px;">
            <div style="font-family:Georgia,'Times New Roman',serif;color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:.2px;">Altus Corp</div>
            <div style="font-family:Arial,Helvetica,sans-serif;color:#9CA3AF;font-size:12px;margin-top:2px;">Official communication from ${escapeHtml(args.senderLabel)}</div>
          </td></tr>
          ${banner ? `<tr><td style="background:${banner.bg};color:${banner.fg};padding:10px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;">${escapeHtml(banner.label)}</td></tr>` : ""}
          <tr><td style="padding:28px;">
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#111827;margin:0 0 16px;">${escapeHtml(args.subject)}</h1>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#374151;">${inner}</div>
            ${
              viewUrl
                ? `<div style="margin-top:28px;"><a href="${viewUrl}" style="display:inline-block;background:#E10600;color:#FFFFFF;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;">${args.requireAck ? "Read &amp; acknowledge" : "View in dashboard"}</a></div>`
                : ""
            }
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9CA3AF;">
            You are receiving this because it was sent to your team at Altus Corp.${args.requireAck ? " This message requires your acknowledgement." : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(args.subject),
      html,
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* internal — template selection + DB resolvers                         */
/* ------------------------------------------------------------------ */

interface RenderContext {
  notification: NotificationEmailInput;
  recipient: { email: string; name: string };
  actorName: string | null;
  taskSubject: string | undefined;
  siteUrl: string;
  statusDisplay: Awaited<ReturnType<typeof getStatusDisplayMap>>;
}

/** Friendly "Sat, Jun 14, 2026" for a YYYY-MM-DD attendance log date. Falls
 *  back to the raw string if it isn't a parseable date. */
function attendanceDateLabel(ymd: string | undefined): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d);
  return `${weekday}, ${formatDate(ymd)}`;
}

function renderNotificationTemplate(ctx: RenderContext): ReactElement | null {
  const meta = parseMeta(ctx.notification.body);
  const actor = ctx.actorName ?? "Someone";
  const subject = ctx.taskSubject ?? "your task";
  const taskId = ctx.notification.taskId ?? "";

  // Attendance Phase A (Task A8) — these kinds carry no taskId; route them
  // BEFORE the task guard below. The meta JSON is read off `notification.body`
  // (logDate / inAt / outAt / hoursLabel — see lib/attendance/notify.ts).
  switch (ctx.notification.kind) {
    case "attendance_late":
      return AttendanceLateEmail({
        recipientName: ctx.recipient.name,
        dateLabel: attendanceDateLabel(meta.logDate),
        inAt: meta.inAt ?? null,
        siteUrl: ctx.siteUrl,
      });
    case "attendance_late_waived":
      return AttendanceLateWaivedEmail({
        recipientName: ctx.recipient.name,
        dateLabel: attendanceDateLabel(meta.logDate),
        inAt: meta.inAt ?? null,
        outAt: meta.outAt ?? null,
        hoursLabel: meta.hoursLabel ?? "—",
        siteUrl: ctx.siteUrl,
      });
    case "attendance_half_day":
      return AttendanceHalfDayEmail({
        recipientName: ctx.recipient.name,
        dateLabel: attendanceDateLabel(meta.logDate),
        inAt: meta.inAt ?? null,
        outAt: meta.outAt ?? null,
        hoursLabel: meta.hoursLabel ?? "—",
        siteUrl: ctx.siteUrl,
      });
    case "attendance_late_deduction":
      return AttendanceLateDeductionEmail({
        recipientName: ctx.recipient.name,
        monthLabel: meta.monthLabel ?? "this month",
        lateCount: meta.lateCount ?? 0,
        dateLabel: attendanceDateLabel(meta.logDate),
        siteUrl: ctx.siteUrl,
      });
    default:
      break;
  }

  // HR Support tickets (mig 0145) — these kinds carry no taskId; the ticket id +
  // number ride in the JSON `body` meta the HR actions write. Confidential
  // (grievance) copy stays generic (the title the dispatcher built already is).
  if (ctx.notification.kind.startsWith("hr_ticket_")) {
    let ticketId = "";
    let ticketNo = 0;
    let confidential = false;
    if (ctx.notification.body) {
      try {
        const m = JSON.parse(ctx.notification.body);
        if (m && typeof m === "object") {
          if (typeof m.ticketId === "string") ticketId = m.ticketId;
          if (typeof m.ticketNo === "number") ticketNo = m.ticketNo;
          confidential = m.confidential === true;
        }
      } catch {
        // free-text body — fall through with defaults (still renders a CTA).
      }
    }
    if (!ticketId) return null;
    const leadByKind: Record<string, string> = {
      hr_ticket_created: "A new request has landed in the HR help desk and is waiting for you.",
      hr_ticket_assigned: "This HR ticket has been assigned to you.",
      hr_ticket_replied: "There's a new reply on your HR ticket.",
      hr_ticket_status_changed: "The status of your HR ticket has changed.",
      hr_ticket_sla_breach: "This HR ticket has breached its response target.",
      hr_ticket_csat_request: "Your HR ticket was resolved — let us know how it went.",
    };
    return HrTicketNoticeEmail({
      recipientName: ctx.recipient.name,
      heading: ctx.notification.title,
      lead: leadByKind[ctx.notification.kind] ?? "There's an update on your HR ticket.",
      ticketNo,
      confidential,
      ctaHref: ticketThreadUrl(ctx.siteUrl, ticketId),
      ctaLabel: "Open the ticket",
    });
  }

  // Without a task to link to, none of the remaining per-task templates make
  // sense.  Drop the email — the in-app inbox still surfaces the row.
  if (!taskId) return null;

  switch (ctx.notification.kind) {
    case "task_assigned":
      return TaskAssignedEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        priority:       meta.priority,
        dueAt:          meta.dueAt,
        initiatorName:  meta.initiatorName,
        siteUrl:        ctx.siteUrl,
      });

    case "task_initiated":
      return TaskInitiatedEmail({
        recipientName:  ctx.recipient.name,
        taskSubject:    subject,
        taskId,
        doerName:       meta.counterpartName,
        dueAt:          meta.dueAt,
        siteUrl:        ctx.siteUrl,
      });

    case "status_changed": {
      const toStatus = meta.toStatus ?? "done";
      const toDisplay = ctx.statusDisplay[toStatus as TaskStatus];
      const fromDisplay = meta.fromStatus
        ? ctx.statusDisplay[meta.fromStatus as TaskStatus]
        : undefined;
      return StatusChangedEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        toStatus,
        fromStatus:     meta.fromStatus,
        siteUrl:        ctx.siteUrl,
        toLabelOverride: toDisplay?.label,
        toToneOverride:  toDisplay ? asChipTone(toDisplay.color) : undefined,
        fromLabelOverride: fromDisplay?.label,
        fromToneOverride:  fromDisplay ? asChipTone(fromDisplay.color) : undefined,
      });
    }

    case "approved":
      return ApprovedEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        note:           meta.note,
        siteUrl:        ctx.siteUrl,
      });

    case "declined":
      return DeclinedEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        note:           meta.note,
        siteUrl:        ctx.siteUrl,
      });

    case "reassigned":
      return ReassignedEmail({
        recipientName:   ctx.recipient.name,
        actorName:       actor,
        taskSubject:     subject,
        taskId,
        isIncoming:      meta.isIncoming ?? true,
        counterpartName: meta.counterpartName,
        siteUrl:         ctx.siteUrl,
      });

    case "transferred":
      return TransferredEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        externalTo:     meta.externalTo,
        note:           meta.note,
        siteUrl:        ctx.siteUrl,
      });

    case "cancelled":
      return CancelledEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        note:           meta.note,
        siteUrl:        ctx.siteUrl,
      });

    case "commented":
      return CommentedEmail({
        recipientName:  ctx.recipient.name,
        actorName:      actor,
        taskSubject:    subject,
        taskId,
        comment:        meta.comment ?? meta.note,
        siteUrl:        ctx.siteUrl,
      });

    case "overdue_digest":
    // Attendance Phase A — `attendance_device` stays inbox-only (no email).
    // The four other attendance kinds (late / late-waived / half-day /
    // late-deduction) are routed above the task guard and never reach here.
    case "attendance_device":
    // Nudge — an on-demand ⚡ ping. Deliberately in-app + push only; we don't
    // want a nudge to also spawn an email.
    case "nudged":
      // overdue_digest belongs in `sendDigestEmail`; attendance_device is kept
      // in-app only. Skip the per-row email.
      return null;

    case "weekly_goals_assigned":
    case "weekly_goals_fill_reminder":
    case "weekly_goals_incomplete":
      // Weekly Goals emails are sent by the weekly-goals cron via their own
      // dedicated senders, never through the per-task dispatcher.
      return null;
    default:
      // Kinds without a dedicated email template (e.g. training_test_failed)
      // are inbox-only — the in-app row still surfaces them.
      return null;
  }
}

async function resolveRecipient(
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const rows = await db
    .select({ email: employees.email, name: employees.name })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { email: row.email, name: row.name };
}

async function resolveTaskSubject(taskId: string): Promise<string | null> {
  const rows = await db
    .select({ subject: tasks.subject, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const s = row.subject?.trim();
  return s && s.length > 0 ? s : row.title;
}

/**
 * Looks up the actor's display name for a given notification id by
 * joining `notifications.actor_id` against `employees.id`.  Used so the
 * dispatcher doesn't have to pre-resolve the actor — it just writes
 * the actor id on the notifications row.
 */
async function resolveActorNameFor(notificationId: string): Promise<string | null> {
  const rows = await db
    .select({ name: employees.name })
    .from(notifications)
    .innerJoin(employees, eq(notifications.actorId, employees.id))
    .where(eq(notifications.id, notificationId))
    .limit(1);
  return rows[0]?.name ?? null;
}
