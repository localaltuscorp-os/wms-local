import "server-only";
import type { ReactElement } from "react";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { employees, notifications, tasks } from "@/db/schema";
import type { NotificationKind } from "@/db/schema";
import { InviteEmail } from "@/emails/invite";
import { ResetPasswordEmail } from "@/emails/reset-password";
import { CredentialsInviteEmail } from "@/emails/credentials-invite";
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
  WeeklyGoalsMondayEmail,
  type WeeklyGoalLine,
} from "@/emails/notifications/WeeklyGoalsMonday";
import { WeeklyGoalsFillReminderEmail } from "@/emails/notifications/WeeklyGoalsFillReminder";
import { WeeklyGoalsIncompleteEmail } from "@/emails/notifications/WeeklyGoalsIncomplete";
import { AttendanceLateEmail } from "@/emails/notifications/attendance-late";
import { AttendanceLateWaivedEmail } from "@/emails/notifications/attendance-late-waived";
import { AttendanceHalfDayEmail } from "@/emails/notifications/attendance-half-day";
import { AttendanceLateDeductionEmail } from "@/emails/notifications/attendance-late-deduction";
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
function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

const FROM = process.env.RESEND_FROM_EMAIL || "Altus Corp Dashboard <onboarding@resend.dev>";

const SUBJECT_MAX = 80;

function clampSubject(s: string): string {
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

function errorMessage(err: unknown): string {
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
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Weekly Goals — planner cron emails (Manan 2026-06)                   */
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
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
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
      // overdue_digest belongs in `sendDigestEmail`; attendance_device is kept
      // in-app only. Skip the per-row email.
      return null;

    case "weekly_goals_assigned":
    case "weekly_goals_fill_reminder":
    case "weekly_goals_incomplete":
      // Weekly Goals emails are sent by the weekly-goals cron via their own
      // dedicated senders, never through the per-task dispatcher.
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
