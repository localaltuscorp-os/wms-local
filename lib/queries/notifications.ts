import "server-only";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  notifications,
  orgSettings,
  tasks,
  type NotificationKind,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Inbox (per-user) feed — kept from M2.3.  The /inbox route renders these
// rows; the unread badge in the main nav uses `getUnreadCount`.  Marking
// read/all-read live here too so the inbox actions are a single import.
// ---------------------------------------------------------------------------

export const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 50;

/**
 * One flat row for the /inbox feed.  Joins the task subject + status
 * (so the row can deep-link with context) and the actor's name (the
 * "Alice approved …" caption).
 */
export type InboxNotificationRow = {
  id: string;
  userId: string;
  taskId: string | null;
  eventId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  actorId: string | null;
  actorName: string | null;
  taskTitle: string | null;
  taskSubject: string | null;
  taskStatus: string | null;
  readAt: Date | null;
  emailSentAt: Date | null;
  createdAt: Date;
};

export interface ListInboxNotificationsArgs {
  userId: string;
  isAdmin: boolean;
  /** Pagination cursor — return rows strictly older than this. */
  before?: Date | undefined;
  /** Override the default page size (capped at 500). */
  limit?: number | undefined;
  /** Filter by a single kind. */
  kind?: NotificationKind | undefined;
}

export interface ListInboxNotificationsResult {
  notifications: InboxNotificationRow[];
  /** ISO string of the oldest row in this page — pass to `?before=`. */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Returns the inbox feed for a user — every notification row addressed to
 * them, newest first.  Admins always see only their own (notifications
 * are per-recipient by design; the admin scope is the RLS read policy,
 * not the query).
 *
 * The cap is +1 over the page size so we can cheaply detect `hasMore`
 * without a COUNT(*).
 */
export async function listInboxNotifications(
  args: ListInboxNotificationsArgs,
): Promise<ListInboxNotificationsResult> {
  const pageSize = Math.min(args.limit ?? DEFAULT_NOTIFICATIONS_PAGE_SIZE, 500);
  const actor = alias(employees, "notif_actor");

  const conditions = [
    eq(notifications.userId, args.userId),
    args.before ? lt(notifications.createdAt, args.before) : undefined,
    args.kind ? eq(notifications.kind, args.kind) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      taskId: notifications.taskId,
      eventId: notifications.eventId,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      actorId: notifications.actorId,
      actorName: actor.name,
      taskTitle: tasks.title,
      taskSubject: tasks.subject,
      taskStatus: tasks.status,
      readAt: notifications.readAt,
      emailSentAt: notifications.emailSentAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .leftJoin(actor, eq(notifications.actorId, actor.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  const list: InboxNotificationRow[] = page.map((r) => ({
    id: r.id,
    userId: r.userId,
    taskId: r.taskId,
    eventId: r.eventId,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    taskTitle: r.taskTitle ?? null,
    taskSubject: r.taskSubject ?? null,
    taskStatus: r.taskStatus ?? null,
    readAt: r.readAt,
    emailSentAt: r.emailSentAt,
    createdAt: r.createdAt,
  }));

  const tail = list.length > 0 ? list[list.length - 1] : undefined;
  const nextCursor = hasMore && tail ? tail.createdAt.toISOString() : null;

  return { notifications: list, nextCursor, hasMore };
}

/**
 * Single integer — count of unread notifications for the user.  Drives
 * the Inbox-pill badge in the main nav.  Indexed on
 * (user_id, read_at, created_at) so this is a covered index scan.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return Number(row?.n ?? 0);
}

/**
 * Marks a single notification as read.  No-op if it's already read or
 * the row doesn't belong to the caller.  Idempotent.
 *
 * RLS pins the row down to the recipient — a user can't mark someone
 * else's notification read.  We additionally scope by userId here so a
 * stray bug in the action doesn't accidentally touch a different row.
 */
export async function markRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}

/**
 * Marks every unread notification for the user as read.  Used by the
 * "Mark all read" button.
 */
export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}

// ---------------------------------------------------------------------------
// Admin notifications log (M5.2) — paginated, filterable view across every
// notification row in the org, with per-channel delivery status derived
// from `notifications.delivered_channels` (what actually delivered) vs
// `org_settings.notification_matrix[kind]` (what was supposed to be tried).
// ---------------------------------------------------------------------------

export type Channel = "email" | "slack" | "whatsapp" | "push";
export type ChannelStatus = "delivered" | "failed" | "not_attempted";

const ALL_CHANNELS: readonly Channel[] = ["email", "slack", "whatsapp", "push"];

function isChannel(v: string): v is Channel {
  return v === "email" || v === "slack" || v === "whatsapp" || v === "push";
}

export interface NotificationRow {
  id: string;
  kind: string;
  createdAt: Date;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  title: string;
  body: string;
  taskId: string | null;
  attemptedChannels: Channel[];
  deliveredChannels: Channel[];
  channelStatus: Record<Channel, ChannelStatus>;
}

export interface ListNotificationsOptions {
  before?: Date;
  limit?: number;
  kinds?: string[];
  recipientIds?: string[];
  from?: Date;
  to?: Date;
  failuresOnly?: boolean;
}

export interface ListNotificationsResult {
  rows: NotificationRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

function clampLimit(n: number | undefined): number {
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  const v = Math.trunc(n as number);
  if (v < 1) return 1;
  if (v > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return v;
}

/**
 * Admin-facing paginated listing.  Joins the recipient employee row for
 * name + email, then enriches each notification with a per-channel
 * delivered/failed/not_attempted status derived from the org's
 * `notification_matrix` (the attempted set for that kind) and the row's
 * own `delivered_channels` audit array.
 *
 * `failuresOnly` is applied AFTER channel-status derivation (cheaper to
 * filter in JS than to encode the matrix join in SQL — the matrix lives
 * in a single jsonb column anyway).
 */
export async function listNotifications(
  opts: ListNotificationsOptions = {},
): Promise<ListNotificationsResult> {
  const limit = clampLimit(opts.limit);
  const wheres: SQL[] = [];
  if (opts.before) wheres.push(lt(notifications.createdAt, opts.before));
  if (opts.from) wheres.push(gte(notifications.createdAt, opts.from));
  if (opts.to) wheres.push(lte(notifications.createdAt, opts.to));
  if (opts.kinds?.length)
    wheres.push(inArray(notifications.kind, opts.kinds as NotificationKind[]));
  if (opts.recipientIds?.length)
    wheres.push(inArray(notifications.userId, opts.recipientIds));

  // The matrix lookup and the notifications query have no data
  // dependency — Promise.all fires them in parallel so the inbox
  // page pays one RTT instead of two.
  const [settingsRows, rows] = await Promise.all([
    db
      .select({ matrix: orgSettings.notificationMatrix })
      .from(orgSettings)
      .where(eq(orgSettings.id, 1))
      .limit(1),
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        createdAt: notifications.createdAt,
        recipientId: notifications.userId,
        recipientName: employees.name,
        recipientEmail: employees.email,
        title: notifications.title,
        body: notifications.body,
        taskId: notifications.taskId,
        deliveredChannels: notifications.deliveredChannels,
      })
      .from(notifications)
      .leftJoin(employees, eq(notifications.userId, employees.id))
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1),
  ]);
  const matrix = (settingsRows[0]?.matrix ?? {}) as Record<string, string[]>;

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const enriched: NotificationRow[] = sliced.map((r) => {
    const attempted = ((matrix[r.kind] ?? []) as string[]).filter(isChannel);
    const delivered = ((r.deliveredChannels ?? []) as string[]).filter(
      isChannel,
    );
    const status: Record<Channel, ChannelStatus> = {
      email: "not_attempted",
      slack: "not_attempted",
      whatsapp: "not_attempted",
      push: "not_attempted",
    };
    // Attempted-but-not-delivered → failed; delivered overrides.
    for (const ch of attempted) status[ch] = "failed";
    for (const ch of delivered) status[ch] = "delivered";
    return {
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt,
      recipientId: r.recipientId ?? "",
      recipientName: r.recipientName ?? "(unknown)",
      recipientEmail: r.recipientEmail ?? "",
      title: r.title ?? "",
      body: r.body ?? "",
      taskId: r.taskId,
      attemptedChannels: attempted,
      deliveredChannels: delivered,
      channelStatus: status,
    };
  });

  const filtered = opts.failuresOnly
    ? enriched.filter((n) =>
        Object.values(n.channelStatus).some((s) => s === "failed"),
      )
    : enriched;

  const last = filtered[filtered.length - 1];
  const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;
  return { rows: filtered, nextCursor, hasMore };
}

export interface NotificationDeliveryStats {
  total24h: number;
  failures24h: number;
  byChannel24h: Record<Channel, number>;
}

/**
 * Tile counts for the /admin/notifications header strip.  All three
 * numbers are derived in one round-trip against the rolling 24h window.
 * "failures" = rows where `delivered_channels` is empty (no arm
 * succeeded).  `byChannel24h` counts how many notifications had each
 * channel in their delivered set (so an email-AND-slack row counts in
 * both).
 */
export async function getNotificationDeliveryStats(
  now: Date = new Date(),
): Promise<NotificationDeliveryStats> {
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rows = (await db.execute(sql`
    WITH last_24h AS (
      SELECT delivered_channels, kind
      FROM notifications
      WHERE created_at >= ${sinceIso}::timestamptz
    )
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE coalesce(array_length(delivered_channels, 1), 0) = 0
      ) AS with_failures,
      jsonb_build_object(
        'email',    COUNT(*) FILTER (WHERE 'email'    = ANY(delivered_channels)),
        'slack',    COUNT(*) FILTER (WHERE 'slack'    = ANY(delivered_channels)),
        'whatsapp', COUNT(*) FILTER (WHERE 'whatsapp' = ANY(delivered_channels)),
        'push',     COUNT(*) FILTER (WHERE 'push'     = ANY(delivered_channels))
      ) AS by_channel
    FROM last_24h
  `)) as unknown as Array<{
    total: string | number;
    with_failures: string | number;
    by_channel: Record<Channel, number> | null;
  }>;

  const row = rows[0];
  const byChannel = row?.by_channel ?? null;
  const defaults: Record<Channel, number> = {
    email: 0,
    slack: 0,
    whatsapp: 0,
    push: 0,
  };
  const merged: Record<Channel, number> = { ...defaults };
  if (byChannel) {
    for (const ch of ALL_CHANNELS) {
      merged[ch] = Number(byChannel[ch] ?? 0);
    }
  }
  return {
    total24h: Number(row?.total ?? 0),
    failures24h: Number(row?.with_failures ?? 0),
    byChannel24h: merged,
  };
}
