import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  notifications,
  notificationDispatchLog,
  tasks,
  type NotificationKind,
} from "@/db/schema";
import { sendNotificationEmail } from "@/lib/email/resend";
import { getRecipientChannelPrefs } from "@/lib/notifications/channel-prefs";
import {
  effectiveEnabled,
  getNotificationPrefs,
  NOTIFICATION_KINDS,
  type NotificationKindKey,
} from "@/lib/profile/notification-prefs";
import { sendSlackDM } from "@/lib/slack/dispatch";
import { sendWhatsApp } from "@/lib/whatsapp/dispatch";
import { sendWebPushToUser } from "@/lib/web-push/client";
import { sendFcmToEmployee } from "@/lib/push/fcm";
import { getNotificationMatrix } from "@/lib/queries/notification-matrix";
import { resolveChannels } from "@/lib/notifications/resolve-channels";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus } from "@/db/enums";

// Pulls `toStatus` out of the row.body JSON meta written by Server
// Actions for status_changed notifications. Returns undefined when the
// body is missing/non-JSON or doesn't carry a toStatus field.
function extractToStatus(body: string | null | undefined): TaskStatus | undefined {
  if (!body) return undefined;
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.toStatus === "string") {
      return parsed.toStatus as TaskStatus;
    }
  } catch {
    // not JSON — caller's fault if they handed us a free-text body for a
    // status_changed kind. Fall through to undefined.
  }
  return undefined;
}

/**
 * M2.3 -> M4 — server-side fan-out from a Server Action mutation to the
 * in-app notification row + every channel the recipient has opted into.
 *
 * Contract (post-M4):
 *   - `notify()` inserts a notification row first.  This is the only
 *     thing that ever blocks the calling action's tx.
 *   - It then loads the recipient's per-channel opt-in flags and fans
 *     four arms in parallel under `Promise.allSettled`:
 *         email · slack · whatsapp · web_push
 *     Each arm internally returns "sent" | "skip" | { error }.  We
 *     translate fulfilled+"sent" into the channel's name in the
 *     `delivered_channels` text[] on the row.
 *   - Channel failures NEVER bubble to the caller and NEVER roll the
 *     row back.  The row is the source of truth — channels are best
 *     effort.
 *   - For backwards compatibility with M2.3 readers that check
 *     `email_sent_at`, we also stamp `email_sent_at = now()` when the
 *     email arm succeeds.  New code should rely on
 *     `delivered_channels` instead.
 *
 * If the row already wrote a `task_events` audit row, pass its id as
 * `eventId` so the notification can deep-link to it in future UI.
 */

export interface NotifyOpts {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null | undefined;
  taskId?: string | null | undefined;
  eventId?: string | null | undefined;
  actorId?: string | null | undefined;
  /**
   * M5.1 — bypass the admin's notification_matrix and force a specific
   * channel subset. Used by /admin/settings → Integrations "Send test"
   * buttons so an admin can verify one channel without flipping the
   * org-wide config.
   */
  forceChannels?: ReadonlyArray<"email" | "slack" | "whatsapp" | "push">;
  /**
   * Profile v2 — when true, the recipient's per-(kind,channel) matrix is
   * overridden so every enabled-at-the-channel-level arm fires. Set by
   * @-mention call sites; honoured only when the recipient has
   * `mention_escalation = true` (the default).
   */
  isMention?: boolean;
  /**
   * Profile v2 (internal) — set when this notify() call is the OOO
   * delegate copy. Prevents infinite delegation if a delegate is also OOO
   * with a delegate. Not part of the public API for callers.
   */
  _skipOoo?: boolean;
}

type ChannelOutcome = "sent" | "skip" | { error: string };

/**
 * Wraps a sender call so any rejection is translated to a fulfilled
 * `{ error }` outcome.  This lets `Promise.allSettled` treat the
 * dispatch as fully best-effort (no "rejected" branches to inspect).
 */
async function safeSend(
  fn: () => Promise<ChannelOutcome>,
): Promise<ChannelOutcome> {
  try {
    return await fn();
  } catch (err) {
    return { error: (err as Error).message ?? String(err) };
  }
}

export async function notify(opts: NotifyOpts): Promise<void> {
  // Best-effort: a notification failure (a slow-DB insert timeout, a channel
  // error, a deleted recipient) must NEVER crash the action that triggered
  // it — that's what surfaced as "we hit a snag" on reassign/transfer. The
  // core mutation has already committed by the time we get here; swallow + log.
  try {
    await notifyImpl(opts);
  } catch (err) {
    console.warn("[notify] non-fatal dispatch failure:", (err as Error)?.message ?? err);
  }
}

async function notifyImpl(opts: NotifyOpts): Promise<void> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? null,
      taskId: opts.taskId ?? null,
      eventId: opts.eventId ?? null,
      actorId: opts.actorId ?? null,
    })
    .returning({
      id: notifications.id,
      userId: notifications.userId,
      taskId: notifications.taskId,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
    });

  if (!row) return;

  // Recipient prefs.  If the recipient was deleted between when the
  // action looked them up and now, just stamp delivered_channels = []
  // and bail.
  const prefs = await getRecipientChannelPrefs(row.userId);
  if (!prefs) {
    try {
      await db
        .update(notifications)
        .set({ deliveredChannels: [] })
        .where(eq(notifications.id, row.id));
    } catch {
      // Even the stamp failure is non-fatal: the row exists, the
      // recipient just won't see any channel marks.
    }
    return;
  }

  // M4 Commit 3a — outbound channels (slack/whatsapp/web_push) want the
  // task's human subject + short-id so their templates can render
  // `*Subject* … View task →` with a deep link.  We look the task up
  // once here so all three arms (email reuses title/body already) share
  // the same projection.  When `taskId` is null (overdue digest etc.)
  // we leave the fields empty and let the templates fall back to the
  // notification title.
  const task = row.taskId
    ? await db.query.tasks.findFirst({
        where: eq(tasks.id, row.taskId),
        columns: { id: true, title: true, subject: true, shortId: true },
      })
    : null;

  const actorName = opts.actorId
    ? (
        await db.query.employees.findFirst({
          where: eq(employees.id, opts.actorId),
          columns: { name: true },
        })
      )?.name ?? ""
    : "";

  // M5.1 — for status_changed kinds, resolve the admin-configured label
  // for `toStatus` so Slack + WhatsApp templates surface renames. The
  // status display map is React-cached, so this is one DB call per RSC
  // tick even when many notifications fire.
  let statusLabel: string | undefined;
  if (row.kind === "status_changed") {
    const toStatus = extractToStatus(row.body);
    if (toStatus) {
      const display = await getStatusDisplayMap();
      statusLabel = display[toStatus]?.label;
    }
  }

  const outboundCtx = {
    kind: row.kind as NotificationKind,
    actorName,
    taskSubject: (task?.subject ?? task?.title ?? row.title) || "",
    body: row.body ?? undefined,
    shortId: task?.shortId ?? "",
    statusLabel,
  };

  // M5.1 — admin-configured per-event channel routing. opts.forceChannels
  // wins (used by /admin/settings Integrations "send test"); otherwise we
  // resolve via the org_settings.notification_matrix JSONB. Missing entries
  // fall back to all 4 channels (resolveChannels handles that). The matrix
  // uses the user-friendly name "push"; we map it to the historical arm
  // name "web_push" below so delivered_channels keeps its existing shape.
  const allowedChannels = new Set<string>(
    opts.forceChannels
      ? opts.forceChannels
      : resolveChannels(row.kind as NotificationKind, await getNotificationMatrix()),
  );
  const allowed = (matrixName: "email" | "slack" | "whatsapp" | "push") =>
    allowedChannels.has(matrixName);

  // Profile v2 — per-(kind,channel) matrix. Mention escalation: if the
  // notification was flagged isMention AND the recipient hasn't disabled
  // escalation, we treat every channel as enabled by their personal matrix.
  const kindKey =
    (NOTIFICATION_KINDS as readonly string[]).includes(row.kind as string)
      ? (row.kind as NotificationKindKey)
      : null;
  const personalMatrix = kindKey ? await getNotificationPrefs(row.userId) : {};
  // `prefs` is non-null here because we returned earlier when it was null.
  // Capture into a local that TypeScript can track inside the inner closure.
  const recipPrefs = prefs;
  const escalated = !!opts.isMention && recipPrefs.mentionEscalation;
  function personalEnabled(channelKey: "email" | "slack" | "whatsapp" | "push"): boolean {
    if (!kindKey) return true; // unknown kind (e.g. overdue_digest) — no override
    if (escalated) return true;
    // Map legacy scalar by channel
    const legacy =
      channelKey === "email"
        ? recipPrefs.emailOptIn
        : channelKey === "slack"
          ? recipPrefs.slackOptIn
          : channelKey === "whatsapp"
            ? recipPrefs.whatsappOptedIn
            : true; // push has no legacy scalar — default true; subscription absence is its own skip
    return effectiveEnabled(personalMatrix, kindKey, channelKey, legacy);
  }

  // Four-arm fan-out.  Each entry is `[channelName, runner]`.  The
  // runner returns "sent" | "skip" | { error }.  When the user is
  // opted-out (or required contact info is missing), we synthesize
  // "skip" without ever invoking the channel sender.
  const arms: Array<
    [string, () => Promise<ChannelOutcome>]
  > = [
    [
      "email",
      async () => {
        if (!allowed("email")) return "skip";
        if (!personalEnabled("email")) return "skip";
        // `sendNotificationEmail` is void-on-success / throws-on-failure.
        await sendNotificationEmail({
          id: row.id,
          userId: row.userId,
          kind: row.kind as NotificationKind,
          title: row.title,
          body: row.body,
          taskId: row.taskId,
        });
        return "sent";
      },
    ],
    [
      "slack",
      async () => {
        if (!allowed("slack")) return "skip";
        if (!personalEnabled("slack")) return "skip";
        return sendSlackDM(prefs, outboundCtx);
      },
    ],
    [
      "whatsapp",
      async () => {
        if (!allowed("whatsapp")) return "skip";
        if (!personalEnabled("whatsapp")) return "skip";
        if (!prefs.whatsappPhone) return "skip";
        return sendWhatsApp(prefs, outboundCtx);
      },
    ],
    [
      "web_push",
      async () => {
        if (!allowed("push")) return "skip";
        if (!personalEnabled("push")) return "skip";
        // Native-mobile push (FCM) — fire-and-forget alongside web push so it
        // never affects the web_push channel outcome or the dispatch latency.
        void sendFcmToEmployee(row.userId, {
          title: opts.title,
          body: opts.body ?? outboundCtx.body ?? "",
          route: row.taskId ? `task/${row.taskId}` : "dashboard",
        }).catch(() => {});
        return sendWebPushToUser(row.userId, row.kind as NotificationKind, {
          actorName: outboundCtx.actorName,
          taskSubject: outboundCtx.taskSubject,
          body: outboundCtx.body,
          shortId: outboundCtx.shortId,
          taskId: row.taskId ?? "",
        });
      },
    ],
  ];

  const results = await Promise.allSettled(
    arms.map(async ([, runner]) => safeSend(runner)),
  );

  const delivered: string[] = [];
  let emailSent = false;
  // Phase 2.1 — accumulate a row per (channel, outcome) attempt for the
  // dispatch log. We persist these AFTER the channel stamps so a slow
  // INSERT can't hold up the user-facing read of delivered_channels.
  const logRows: Array<{
    notificationId: string;
    channel: "email" | "slack" | "whatsapp" | "web_push";
    status: "sent" | "skipped" | "failed";
    errorMessage: string | null;
    nextAttemptAt: Date | null;
  }> = [];
  for (let i = 0; i < arms.length; i++) {
    const armEntry = arms[i];
    const settled = results[i];
    if (!armEntry || !settled) continue;
    const name = armEntry[0] as "email" | "slack" | "whatsapp" | "web_push";
    // settled.status is always "fulfilled" because safeSend swallows
    // rejections, but the type system doesn't know that; guard for safety.
    if (settled.status !== "fulfilled") {
      logRows.push({
        notificationId: row.id,
        channel: name,
        status: "failed",
        errorMessage: "unexpected promise rejection",
        nextAttemptAt: nextRetryAt(1),
      });
      continue;
    }
    const value = settled.value;
    if (value === "sent") {
      delivered.push(name);
      if (name === "email") emailSent = true;
      logRows.push({
        notificationId: row.id,
        channel: name,
        status: "sent",
        errorMessage: null,
        nextAttemptAt: null,
      });
    } else if (value === "skip") {
      logRows.push({
        notificationId: row.id,
        channel: name,
        status: "skipped",
        errorMessage: null,
        nextAttemptAt: null,
      });
    } else {
      // { error }
      logRows.push({
        notificationId: row.id,
        channel: name,
        status: "failed",
        errorMessage: value.error.slice(0, 2000),
        nextAttemptAt: nextRetryAt(1),
      });
    }
  }

  // Stamp delivered_channels + (for soft compatibility) email_sent_at.
  // Swallow update errors — the row itself is the source of truth and
  // a missed audit stamp must not crash the calling action.
  try {
    const patch: { deliveredChannels: string[]; emailSentAt?: Date } = {
      deliveredChannels: delivered,
    };
    if (emailSent) patch.emailSentAt = new Date();
    await db
      .update(notifications)
      .set(patch)
      .where(eq(notifications.id, row.id));
  } catch {
    // ignore
  }

  // Persist the per-channel dispatch log. Same swallow-and-continue
  // contract — failures here must never crash the calling action.
  if (logRows.length > 0) {
    try {
      await db.insert(notificationDispatchLog).values(logRows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[dispatch] failed to write dispatch log", err);
    }
  }

  // Profile v2 — OOO delegate copy. If the primary recipient is currently
  // out-of-office AND has a delegate set, enqueue ONE additional notify()
  // for the delegate with `_skipOoo: true` so chained delegation stops
  // at depth 1. Fire-and-forget — failures here are logged but do not
  // affect the primary notification.
  if (
    !opts._skipOoo &&
    recipPrefs.oooDelegateId &&
    isCurrentlyOoo(recipPrefs.oooStart, recipPrefs.oooEnd)
  ) {
    try {
      await notify({
        userId: recipPrefs.oooDelegateId,
        kind: opts.kind,
        title: `[Covering for ${recipPrefs.name}] ${opts.title}`,
        body: opts.body,
        taskId: opts.taskId,
        eventId: opts.eventId,
        actorId: opts.actorId,
        forceChannels: opts.forceChannels,
        isMention: opts.isMention,
        _skipOoo: true,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[dispatch] OOO delegate copy failed", err);
    }
  }
}

/**
 * Profile v2 — is `today` (UTC) within the user's OOO window?
 * The columns are PostgreSQL `date` (yyyy-mm-dd) so a string compare is
 * correct. Inclusive on both ends.
 */
function isCurrentlyOoo(
  oooStart: string | null,
  oooEnd: string | null,
): boolean {
  if (!oooStart || !oooEnd) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today >= oooStart && today <= oooEnd;
}

/**
 * Exponential-backoff schedule for the retry cron. attempt=1 → 60s,
 * attempt=2 → 5min, attempt=3 → 30min. Past 3 we mark `failed_terminal`
 * in the retry helper and stop bothering.
 */
export function nextRetryAt(attemptCount: number): Date {
  const minutes = attemptCount <= 1 ? 1 : attemptCount === 2 ? 5 : 30;
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * The shape of a task that the dispatch logic needs to resolve
 * recipients.  Kept tiny on purpose so callers can pass either the
 * full `Task` row or a minimal projection.
 */
export interface TaskRecipientShape {
  id: string;
  createdById: string | null;
  initiatorId: string;
  doerId: string;
}

export interface NotifyManyOpts {
  /** The actor who triggered the mutation — they're EXCLUDED from the fan-out. */
  actorId: string;
  kind: NotificationKind;
  /** Shared title for every recipient.  Keep ≤ ~60 chars. */
  title: string;
  body?: string | null | undefined;
  eventId?: string | null | undefined;
  /**
   * Override the recipient set.  If omitted, falls back to
   * "creator + initiator + doer" minus the actor.  Pass an empty array
   * to skip the fan-out entirely (e.g. for actions where you want
   * to call `notify()` directly with bespoke titles).
   */
  recipients?: ReadonlyArray<string | null | undefined> | undefined;
}

/**
 * Loads the task by id, computes the recipient set, and dispatches a
 * notification per recipient.  Caller must have already mutated the
 * task; we only ever READ it here.
 */
export async function notifyManyForTask(
  taskId: string,
  opts: NotifyManyOpts,
): Promise<void> {
  // Best-effort, same rationale as notify(): never let a fan-out failure
  // crash the triggering action.
  try {
    await notifyManyForTaskImpl(taskId, opts);
  } catch (err) {
    console.warn("[notifyManyForTask] non-fatal dispatch failure:", (err as Error)?.message ?? err);
  }
}

async function notifyManyForTaskImpl(
  taskId: string,
  opts: NotifyManyOpts,
): Promise<void> {
  let task: TaskRecipientShape | undefined;
  if (opts.recipients === undefined) {
    const row = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: {
        id: true,
        createdById: true,
        initiatorId: true,
        doerId: true,
      },
    });
    if (!row) return;
    task = row;
  }

  const candidates: ReadonlyArray<string | null | undefined> =
    opts.recipients ??
    (task
      ? [task.createdById, task.initiatorId, task.doerId]
      : []);

  const recipients = dedupeRecipients(candidates, opts.actorId);

  // Fan-out in parallel — each notify() does its own DB insert + email/
  // Slack/WhatsApp/push work, none of which depends on the others.
  // Serial awaits made a 5-recipient fan-out cost 5× the latency of a
  // single one; Promise.allSettled here so one bad channel for one
  // recipient can't poison the whole batch.
  await Promise.allSettled(
    recipients.map((userId) =>
      notify({
        userId,
        kind: opts.kind,
        title: opts.title,
        body: opts.body ?? null,
        taskId,
        eventId: opts.eventId ?? null,
        actorId: opts.actorId,
      }),
    ),
  );
}

/**
 * Remove duplicates, nulls/undefineds, and the actor themselves.  The
 * actor exclusion is mandatory — Manan explicitly does not want users
 * notifying themselves about their own actions.
 */
export function dedupeRecipients(
  ids: ReadonlyArray<string | null | undefined>,
  actorId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (id === actorId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
