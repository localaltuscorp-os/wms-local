import "server-only";
import { and, asc, eq, lte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  notificationDispatchLog,
  tasks,
  employees,
  type NotificationKind,
} from "@/db/schema";
import { sendNotificationEmail } from "@/lib/email/resend";
import { sendSlackDM } from "@/lib/slack/dispatch";
import { sendWhatsApp } from "@/lib/whatsapp/dispatch";
import { sendWebPushToUser } from "@/lib/web-push/client";
import { getRecipientChannelPrefs } from "@/lib/notifications/channel-prefs";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { nextRetryAt } from "@/lib/notifications/dispatch";
import type { TaskStatus } from "@/db/enums";

const MAX_ATTEMPTS = 3;
type ChannelName = "email" | "slack" | "whatsapp" | "web_push";

interface RetryRow {
  id: string;
  notificationId: string;
  channel: ChannelName;
  attemptCount: number;
}

interface NotificationCtx {
  id: string;
  userId: string;
  taskId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  actorId: string | null;
}

/**
 * Phase 2.1 — drain the retry queue. Picks dispatch-log rows where
 *   status = 'failed'
 *   AND next_attempt_at <= now()
 *   AND attempt_count < MAX_ATTEMPTS
 * and re-runs each row's single channel. Each row's status is updated to
 * `sent` / `failed` (with bumped attempt_count + next_attempt_at) /
 * `failed_terminal` (after MAX_ATTEMPTS).
 *
 * Returns a per-channel summary so the cron route can log it.
 */
export async function retryFailedDispatches(opts: { limit?: number } = {}): Promise<{
  picked: number;
  sent: number;
  failed: number;
  terminal: number;
  notFound: number;
}> {
  const limit = opts.limit ?? 50;
  const now = new Date();
  const stats = { picked: 0, sent: 0, failed: 0, terminal: 0, notFound: 0 };

  // Pick eligible rows.
  const pending = (await db
    .select({
      id: notificationDispatchLog.id,
      notificationId: notificationDispatchLog.notificationId,
      channel: notificationDispatchLog.channel,
      attemptCount: notificationDispatchLog.attemptCount,
    })
    .from(notificationDispatchLog)
    .where(
      and(
        eq(notificationDispatchLog.status, "failed"),
        lte(notificationDispatchLog.nextAttemptAt, now),
        lt(notificationDispatchLog.attemptCount, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationDispatchLog.nextAttemptAt))
    .limit(limit)) as RetryRow[];

  stats.picked = pending.length;
  if (pending.length === 0) return stats;

  // Lazily-loaded shared cache so we don't re-fetch the same notification
  // / recipient / task across multiple retry rows for the same notification.
  const notifCache = new Map<string, NotificationCtx | null>();
  const prefsCache = new Map<string, Awaited<ReturnType<typeof getRecipientChannelPrefs>>>();
  const taskCache = new Map<string, { title: string; subject: string | null; shortId: string | null } | null>();
  const actorCache = new Map<string, string>();
  let statusDisplay: Awaited<ReturnType<typeof getStatusDisplayMap>> | null = null;

  for (const row of pending) {
    const next = row.attemptCount + 1;
    // 1. Load notification context.
    let notif = notifCache.get(row.notificationId);
    if (notif === undefined) {
      const [n] = await db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          taskId: notifications.taskId,
          kind: notifications.kind,
          title: notifications.title,
          body: notifications.body,
          actorId: notifications.actorId,
        })
        .from(notifications)
        .where(eq(notifications.id, row.notificationId))
        .limit(1);
      notif = (n as NotificationCtx | undefined) ?? null;
      notifCache.set(row.notificationId, notif);
    }
    if (!notif) {
      // The notification was deleted — terminal-fail this log row so
      // we stop trying.
      await db
        .update(notificationDispatchLog)
        .set({
          status: "failed_terminal",
          errorMessage: "notification deleted",
          attemptCount: next,
          attemptedAt: new Date(),
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationDispatchLog.id, row.id));
      stats.notFound++;
      stats.terminal++;
      continue;
    }

    // 2. Load recipient prefs.
    let prefs = prefsCache.get(notif.userId);
    if (prefs === undefined) {
      prefs = await getRecipientChannelPrefs(notif.userId);
      prefsCache.set(notif.userId, prefs);
    }
    if (!prefs) {
      // Recipient deleted — terminal-fail.
      await db
        .update(notificationDispatchLog)
        .set({
          status: "failed_terminal",
          errorMessage: "recipient deleted",
          attemptCount: next,
          attemptedAt: new Date(),
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationDispatchLog.id, row.id));
      stats.terminal++;
      continue;
    }

    // 3. Run the one channel.
    const outcome = await runChannel(row.channel, notif, prefs, {
      taskCache,
      actorCache,
      statusDisplay: async () => (statusDisplay ??= await getStatusDisplayMap()),
    });

    // 4. Persist the new outcome.
    const isTerminal = outcome.status === "failed" && next >= MAX_ATTEMPTS;
    const finalStatus = isTerminal ? "failed_terminal" : outcome.status;
    await db
      .update(notificationDispatchLog)
      .set({
        status: finalStatus,
        errorMessage: outcome.error ?? null,
        attemptCount: next,
        attemptedAt: new Date(),
        nextAttemptAt:
          outcome.status === "failed" && !isTerminal ? nextRetryAt(next) : null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDispatchLog.id, row.id));

    if (outcome.status === "sent") {
      stats.sent++;
      // Add the channel name to the parent notification's
      // delivered_channels so the UI catches up.
      await db
        .update(notifications)
        .set({
          deliveredChannels: sql`array_append(coalesce(${notifications.deliveredChannels}, '{}'), ${row.channel})`,
          ...(row.channel === "email" ? { emailSentAt: new Date() } : {}),
        })
        .where(eq(notifications.id, notif.id))
        .catch(() => {});
    } else if (isTerminal) {
      stats.terminal++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}

interface ChannelOutcome {
  status: "sent" | "skipped" | "failed";
  error?: string;
}

interface ChannelHelpers {
  taskCache: Map<string, { title: string; subject: string | null; shortId: string | null } | null>;
  actorCache: Map<string, string>;
  statusDisplay: () => Promise<Awaited<ReturnType<typeof getStatusDisplayMap>>>;
}

async function runChannel(
  channel: ChannelName,
  notif: NotificationCtx,
  prefs: NonNullable<Awaited<ReturnType<typeof getRecipientChannelPrefs>>>,
  helpers: ChannelHelpers,
): Promise<ChannelOutcome> {
  try {
    switch (channel) {
      case "email": {
        if (!prefs.emailOptIn) return { status: "skipped" };
        await sendNotificationEmail({
          id: notif.id,
          userId: notif.userId,
          kind: notif.kind,
          title: notif.title,
          body: notif.body,
          taskId: notif.taskId,
        });
        return { status: "sent" };
      }
      case "slack": {
        if (!prefs.slackOptIn) return { status: "skipped" };
        const ctx = await buildOutboundCtx(notif, helpers);
        const res = await sendSlackDM(prefs, ctx);
        return outcomeFromChannelResult(res);
      }
      case "whatsapp": {
        if (!prefs.whatsappOptedIn || !prefs.whatsappPhone) {
          return { status: "skipped" };
        }
        const ctx = await buildOutboundCtx(notif, helpers);
        const res = await sendWhatsApp(prefs, ctx);
        return outcomeFromChannelResult(res);
      }
      case "web_push": {
        const ctx = await buildOutboundCtx(notif, helpers);
        const res = await sendWebPushToUser(notif.userId, notif.kind, {
          actorName: ctx.actorName,
          taskSubject: ctx.taskSubject,
          body: ctx.body,
          shortId: ctx.shortId,
          taskId: notif.taskId ?? "",
        });
        return outcomeFromChannelResult(res);
      }
    }
  } catch (err) {
    return { status: "failed", error: errMsg(err).slice(0, 2000) };
  }
}

function outcomeFromChannelResult(res: "sent" | "skip" | { error: string }): ChannelOutcome {
  if (res === "sent") return { status: "sent" };
  if (res === "skip") return { status: "skipped" };
  return { status: "failed", error: res.error.slice(0, 2000) };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}

async function buildOutboundCtx(
  notif: NotificationCtx,
  helpers: ChannelHelpers,
): Promise<{
  kind: NotificationKind;
  actorName: string;
  taskSubject: string;
  body: string | undefined;
  shortId: string;
  statusLabel: string | undefined;
}> {
  // Task (cached per notification id).
  let task = notif.taskId ? helpers.taskCache.get(notif.taskId) : null;
  if (notif.taskId && task === undefined) {
    const [t] = await db
      .select({ title: tasks.title, subject: tasks.subject, shortId: tasks.shortId })
      .from(tasks)
      .where(eq(tasks.id, notif.taskId))
      .limit(1);
    task = t ?? null;
    helpers.taskCache.set(notif.taskId, task);
  }

  // Actor (cached per id).
  let actorName = "";
  if (notif.actorId) {
    const cached = helpers.actorCache.get(notif.actorId);
    if (cached !== undefined) {
      actorName = cached;
    } else {
      const [a] = await db
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, notif.actorId))
        .limit(1);
      actorName = a?.name ?? "";
      helpers.actorCache.set(notif.actorId, actorName);
    }
  }

  // Status label (lazy global cache).
  let statusLabel: string | undefined;
  if (notif.kind === "status_changed") {
    const toStatus = extractToStatus(notif.body);
    if (toStatus) {
      const display = await helpers.statusDisplay();
      statusLabel = display[toStatus]?.label;
    }
  }

  return {
    kind: notif.kind,
    actorName,
    taskSubject: (task?.subject ?? task?.title ?? notif.title) || "",
    body: notif.body ?? undefined,
    shortId: task?.shortId ?? "",
    statusLabel,
  };
}

function extractToStatus(body: string | null): TaskStatus | undefined {
  if (!body) return undefined;
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.toStatus === "string") {
      return parsed.toStatus as TaskStatus;
    }
  } catch {
    // not JSON; ignore
  }
  return undefined;
}
