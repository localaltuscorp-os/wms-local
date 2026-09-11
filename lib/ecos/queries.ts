import "server-only";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, broadcastSegments, broadcastPollResponses, broadcastTemplates, employees, type Broadcast, type BroadcastRecipient, type BroadcastTemplate } from "@/db/schema";
import type { AudienceRule } from "@/lib/ecos/audience";
import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
  BroadcastRecurrence,
  BroadcastRecipientStatus,
} from "@/db/enums";
import { requireUser } from "@/lib/auth/current";
import { isBroadcastAdmin } from "@/lib/ecos/permissions";

/**
 * BROADCASTS (ECOS, migrations 0179/0180/0215) — read model.
 *
 * SCOPE, since this module stopped being HR-only (see lib/ecos/permissions.ts):
 * the author-facing queries no longer demand HR staff, they SCOPE. A broadcast
 * admin (super-admin / HR) sees every broadcast in the org; everyone else sees
 * the ones they sent themselves. That is what makes "anyone can broadcast" safe
 * to turn on without also making everyone's send history public.
 *
 * Employee-facing queries take an explicit `employeeId` and are NOT gated here —
 * the calling page/action owns the "this is me" check.
 */

/** Who is asking, and how much of the org they are allowed to see. */
async function viewerScope(): Promise<{ meId: string; admin: boolean }> {
  const me = await requireUser();
  return { meId: me.id, admin: await isBroadcastAdmin(me) };
}

export interface BroadcastListItem {
  id: string;
  title: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  status: BroadcastStatus;
  recurrence: BroadcastRecurrence;
  scheduledFor: Date | null;
  recipientCount: number;
  readCount: number;
  ackCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
  /** The viewer sent this one. */
  mine: boolean;
  /** The viewer may duplicate / archive / resend it (its author, or an admin). */
  canManage: boolean;
}

/**
 * The "Sent" list — every broadcast the viewer is allowed to see, with live
 * read/ack rollups. Admins get the whole org; everyone else gets their own.
 */
export async function listBroadcasts(): Promise<BroadcastListItem[]> {
  const { meId, admin } = await viewerScope();

  const rows = await db
    .select({
      id: broadcasts.id,
      title: broadcasts.title,
      category: broadcasts.category,
      priority: broadcasts.priority,
      status: broadcasts.status,
      recurrence: broadcasts.recurrence,
      scheduledFor: broadcasts.scheduledFor,
      recipientCount: broadcasts.recipientCount,
      publishedAt: broadcasts.publishedAt,
      createdAt: broadcasts.createdAt,
      authorId: broadcasts.authorId,
      authorName: employees.name,
    })
    .from(broadcasts)
    .leftJoin(employees, eq(broadcasts.authorId, employees.id))
    .where(admin ? undefined : eq(broadcasts.authorId, meId))
    .orderBy(desc(broadcasts.createdAt));

  // Live read/ack rollups per broadcast (FILTER-aggregate in one grouped pass).
  const counts = await db
    .select({
      broadcastId: broadcastRecipients.broadcastId,
      readCount: sql<number>`count(*) filter (where ${broadcastRecipients.status} <> 'pending')`,
      ackCount: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'acknowledged')`,
    })
    .from(broadcastRecipients)
    .groupBy(broadcastRecipients.broadcastId);

  const byId = new Map<string, { readCount: number; ackCount: number }>();
  for (const c of counts) {
    byId.set(c.broadcastId, {
      readCount: Number(c.readCount) || 0,
      ackCount: Number(c.ackCount) || 0,
    });
  }

  return rows.map((r) => {
    const c = byId.get(r.id);
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      priority: r.priority,
      status: r.status,
      recurrence: r.recurrence,
      scheduledFor: r.scheduledFor,
      recipientCount: r.recipientCount,
      readCount: c?.readCount ?? 0,
      ackCount: c?.ackCount ?? 0,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      authorId: r.authorId,
      authorName: r.authorName,
      mine: r.authorId === meId,
      canManage: admin || r.authorId === meId,
    };
  });
}

export interface BroadcastStats {
  total: number;
  read: number;
  acknowledged: number;
  pending: number;
}

export interface BroadcastRecipientRow {
  employeeId: string;
  name: string;
  email: string;
  department: string | null;
  /** For the manual-WhatsApp panel — the opted-in WhatsApp number, else the phone. */
  phone: string | null;
  status: BroadcastRecipientStatus;
  deliveredAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  deliveredChannels: string[];
  snoozeCount: number;
  snoozedAt: Date | null;
}

/**
 * Full author view of one broadcast: the row, delivery stats, per-recipient
 * list. Readable by the broadcast's AUTHOR and by broadcast admins — returns
 * null for anyone else, which the page turns into "no analytics panel" rather
 * than an error (they may still be a recipient and entitled to READ it).
 */
export async function getBroadcastWithStats(id: string): Promise<{
  broadcast: Broadcast;
  stats: BroadcastStats;
  recipients: BroadcastRecipientRow[];
} | null> {
  const { meId, admin } = await viewerScope();

  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, id),
  });
  if (!broadcast) return null;
  if (!admin && broadcast.authorId !== meId) return null;

  const recipRows = await db
    .select({
      employeeId: broadcastRecipients.employeeId,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      phone: employees.phone,
      whatsappPhone: employees.whatsappPhone,
      status: broadcastRecipients.status,
      deliveredAt: broadcastRecipients.deliveredAt,
      readAt: broadcastRecipients.readAt,
      acknowledgedAt: broadcastRecipients.acknowledgedAt,
      deliveredChannels: broadcastRecipients.deliveredChannels,
      snoozeCount: broadcastRecipients.snoozeCount,
      snoozedAt: broadcastRecipients.snoozedAt,
    })
    .from(broadcastRecipients)
    .innerJoin(employees, eq(employees.id, broadcastRecipients.employeeId))
    .where(eq(broadcastRecipients.broadcastId, id))
    .orderBy(employees.name);

  const recips: BroadcastRecipientRow[] = recipRows.map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    email: r.email,
    department: r.department,
    phone: r.whatsappPhone?.trim() || r.phone?.trim() || null,
    status: r.status,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
    acknowledgedAt: r.acknowledgedAt,
    deliveredChannels: Array.isArray(r.deliveredChannels)
      ? (r.deliveredChannels as string[])
      : [],
    snoozeCount: r.snoozeCount ?? 0,
    snoozedAt: r.snoozedAt,
  }));

  const stats: BroadcastStats = {
    total: recips.length,
    read: 0,
    acknowledged: 0,
    pending: 0,
  };
  for (const r of recips) {
    if (r.status === "acknowledged") stats.acknowledged += 1;
    else if (r.status === "read") stats.read += 1;
    else stats.pending += 1;
  }

  return { broadcast, stats, recipients: recips };
}

/** Employee-facing single-broadcast read: the broadcast + THIS employee's receipt. */
export async function getBroadcastForEmployee(
  broadcastId: string,
  employeeId: string,
): Promise<{ broadcast: Broadcast; receipt: BroadcastRecipient | null } | null> {
  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, broadcastId),
  });
  if (!broadcast) return null;

  const receipt = await db.query.broadcastRecipients.findFirst({
    where: and(
      eq(broadcastRecipients.broadcastId, broadcastId),
      eq(broadcastRecipients.employeeId, employeeId),
    ),
  });

  return { broadcast, receipt: receipt ?? null };
}

/** The employee's own broadcast inbox — everything delivered to them, newest first. */
export async function listMyBroadcasts(
  employeeId: string,
): Promise<{ broadcast: Broadcast; receipt: BroadcastRecipient }[]> {
  const rows = await db
    .select({
      broadcast: broadcasts,
      receipt: broadcastRecipients,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(eq(broadcastRecipients.employeeId, employeeId))
    .orderBy(
      desc(sql`coalesce(${broadcasts.publishedAt}, ${broadcastRecipients.createdAt})`),
    );

  return rows.map((r) => ({ broadcast: r.broadcast, receipt: r.receipt }));
}

/**
 * The app-lock gate query — the OLDEST published, lock-requiring broadcast this
 * employee has NOT yet acknowledged, or null. FAIL-OPEN: any error returns null
 * so a broken read can never freeze a user out of the app.
 */
export async function pendingLockBroadcastForEmployee(
  employeeId: string,
): Promise<Broadcast | null> {
  try {
    const rows = await db
      .select({ broadcast: broadcasts })
      .from(broadcastRecipients)
      .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
      .where(
        and(
          eq(broadcastRecipients.employeeId, employeeId),
          eq(broadcasts.requireLock, true),
          eq(broadcasts.status, "published"),
          ne(broadcastRecipients.status, "acknowledged"),
        ),
      )
      .orderBy(sql`${broadcasts.publishedAt} asc nulls last`)
      .limit(1);
    return rows[0]?.broadcast ?? null;
  } catch {
    // Fail-open — the app-lock gate must never hard-block on a read error.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Saved segments (Phase 2)                                             */
/* ------------------------------------------------------------------ */

export interface SegmentRow {
  id: string;
  name: string;
  rule: AudienceRule;
}

/** All saved audience segments, alphabetical. Shared across senders. */
export async function listBroadcastSegments(): Promise<SegmentRow[]> {
  await requireUser();
  const rows = await db
    .select({ id: broadcastSegments.id, name: broadcastSegments.name, rule: broadcastSegments.rule })
    .from(broadcastSegments)
    .orderBy(broadcastSegments.name);
  return rows.map((r) => ({ id: r.id, name: r.name, rule: r.rule as AudienceRule }));
}

/* ------------------------------------------------------------------ */
/* Inline poll / quiz (Phase 2)                                         */
/* ------------------------------------------------------------------ */

/** Per-option vote counts for a broadcast poll (index-aligned to poll.options). */
export async function getPollResults(
  broadcastId: string,
  optionCount: number,
): Promise<{ counts: number[]; total: number }> {
  const rows = await db
    .select({
      optionIndex: broadcastPollResponses.optionIndex,
      n: sql<number>`count(*)`,
    })
    .from(broadcastPollResponses)
    .where(eq(broadcastPollResponses.broadcastId, broadcastId))
    .groupBy(broadcastPollResponses.optionIndex);

  const counts = new Array<number>(Math.max(0, optionCount)).fill(0);
  let total = 0;
  for (const r of rows) {
    const n = Number(r.n) || 0;
    total += n;
    if (r.optionIndex >= 0 && r.optionIndex < counts.length) counts[r.optionIndex] = n;
  }
  return { counts, total };
}

/** This employee's chosen option for a broadcast poll, or null if they haven't voted. */
export async function getMyPollResponse(
  broadcastId: string,
  employeeId: string,
): Promise<number | null> {
  const row = await db.query.broadcastPollResponses.findFirst({
    where: and(
      eq(broadcastPollResponses.broadcastId, broadcastId),
      eq(broadcastPollResponses.employeeId, employeeId),
    ),
  });
  return row ? row.optionIndex : null;
}

/* ------------------------------------------------------------------ */
/* Templates + org BI (Phase 3)                                         */
/* ------------------------------------------------------------------ */

/** All reusable broadcast templates, newest first. Shared across senders. */
export async function listBroadcastTemplates(): Promise<BroadcastTemplate[]> {
  await requireUser();
  return db.select().from(broadcastTemplates).orderBy(desc(broadcastTemplates.createdAt));
}

export interface EcosOrgStats {
  totalBroadcasts: number;
  published: number;
  scheduled: number;
  drafts: number;
  totalRecipients: number;
  totalReads: number;
  totalAcks: number;
  avgReadPct: number; // reads / recipients across all published
  avgAckPct: number;
}

/**
 * Broadcast rollup for the analytics header. SCOPED like `listBroadcasts`: an
 * admin sees the whole org, a normal sender sees their own sends — so the
 * headline numbers always describe the same set of broadcasts as the list
 * underneath them.
 */
export async function getEcosOrgStats(): Promise<EcosOrgStats> {
  const { meId, admin } = await viewerScope();
  const mine = admin ? undefined : eq(broadcasts.authorId, meId);

  const [bStats] = await db
    .select({
      total: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${broadcasts.status} = 'published')`,
      scheduled: sql<number>`count(*) filter (where ${broadcasts.status} = 'scheduled')`,
      drafts: sql<number>`count(*) filter (where ${broadcasts.status} = 'draft')`,
    })
    .from(broadcasts)
    .where(mine);

  const [rStats] = await db
    .select({
      recipients: sql<number>`count(*)`,
      reads: sql<number>`count(*) filter (where ${broadcastRecipients.status} <> 'pending')`,
      acks: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'acknowledged')`,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(mine);

  const recipients = Number(rStats?.recipients) || 0;
  const reads = Number(rStats?.reads) || 0;
  const acks = Number(rStats?.acks) || 0;
  return {
    totalBroadcasts: Number(bStats?.total) || 0,
    published: Number(bStats?.published) || 0,
    scheduled: Number(bStats?.scheduled) || 0,
    drafts: Number(bStats?.drafts) || 0,
    totalRecipients: recipients,
    totalReads: reads,
    totalAcks: acks,
    avgReadPct: recipients > 0 ? Math.round((reads / recipients) * 100) : 0,
    avgAckPct: recipients > 0 ? Math.round((acks / recipients) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* The centre-screen popup (0215)                                       */
/* ------------------------------------------------------------------ */

export interface PopupBroadcast {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  from: string;
  publishedAt: Date | null;
  requireAck: boolean;
  media: Array<{ url: string; name: string; kind: "image" | "video" }>;
}

/**
 * The next broadcast that should FLASH in front of this employee, or null.
 *
 * Eligible = published, popup enabled, addressed to them, and their receipt is
 * still pending (an acknowledge-required broadcast keeps popping until it is
 * actually acknowledged, not merely read). NEWEST first — if three land at once
 * the most recent is the one that matters, and the rest are still waiting in
 * the inbox.
 *
 * SNOOZE is the whole reason `sessionId` is a parameter. Closing the popup with
 * its X stamps the browser session it was dismissed in onto the receipt; this
 * query re-admits it the moment the session it is asked with is a DIFFERENT one
 * — i.e. at the next login. Passing no session id means "nothing is snoozed for
 * me", which is the correct answer for a caller that cannot identify a session.
 *
 * FAIL-CLOSED, quietly: this runs on a 5-second poll on every authed page, so
 * an error returns null (no popup) rather than propagating. A missed popup is a
 * message still sitting in the inbox; a thrown error here would be a broken
 * page for every user in the app.
 */
export async function nextPopupBroadcastForEmployee(
  employeeId: string,
  sessionId: string | null,
): Promise<PopupBroadcast | null> {
  try {
    const rows = await db
      .select({ broadcast: broadcasts })
      .from(broadcastRecipients)
      .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
      .where(
        and(
          eq(broadcastRecipients.employeeId, employeeId),
          eq(broadcastRecipients.status, "pending"),
          eq(broadcasts.status, "published"),
          eq(broadcasts.popup, true),
          // Never double up with the full-screen app-lock gate: a lock-mode
          // broadcast already takes over the entire app on the next render.
          eq(broadcasts.requireLock, false),
          sessionId
            ? or(
                isNull(broadcastRecipients.snoozeSession),
                ne(broadcastRecipients.snoozeSession, sessionId),
              )
            : undefined,
        ),
      )
      .orderBy(desc(sql`coalesce(${broadcasts.publishedAt}, ${broadcastRecipients.createdAt})`))
      .limit(1);

    const b = rows[0]?.broadcast;
    if (!b) return null;

    // Imported lazily: this module is pulled into pages that never show a
    // popup, and the media signer reaches for the storage client.
    const [{ readAttachments, splitAttachments, senderLabel }, { signAttachmentUrls }] =
      await Promise.all([import("@/lib/ecos/labels"), import("@/lib/ecos/media")]);

    const { media } = splitAttachments(readAttachments(b.attachments));
    const signed = await signAttachmentUrls(media);

    return {
      id: b.id,
      title: b.title,
      bodyHtml: b.bodyHtml,
      bodyText: b.bodyText,
      category: b.category,
      priority: b.priority,
      from: senderLabel(b),
      publishedAt: b.publishedAt,
      requireAck: b.ackMode === "acknowledge",
      media: media
        .map((m) => ({ url: signed.get(m.path) ?? "", name: m.name, kind: m.kind }))
        .filter((m) => m.url),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard analytics (0215)                                           */
/* ------------------------------------------------------------------ */

export interface BroadcastAnalytics {
  scope: "org" | "mine";
  totals: EcosOrgStats;
  /** Reach + engagement grouped by category, best-read first. */
  byCategory: Array<{ key: BroadcastCategory; sent: number; recipients: number; reads: number; readPct: number }>;
  /** Same, grouped by priority. */
  byPriority: Array<{ key: BroadcastPriority; sent: number; recipients: number; reads: number; readPct: number }>;
  /** Delivery counts per channel, from the per-recipient receipts. */
  byChannel: Array<{ channel: string; delivered: number }>;
  /** Who broadcasts the most (admin scope only — a sender is always just them). */
  topSenders: Array<{ name: string; sent: number; recipients: number; readPct: number }>;
  /** Published broadcasts per day for the last 30 days. */
  timeline: Array<{ day: string; sent: number }>;
  /** Median minutes from publish → first open, across all opened receipts. */
  medianOpenMinutes: number | null;
  /** How often the popup gets waved away before it is read. */
  snoozes: { totalSnoozes: number; recipientsWhoSnoozed: number };
  /** The five worst-read published broadcasts — the ones that need a nudge. */
  worstRead: Array<{ id: string; title: string; recipients: number; reads: number; readPct: number }>;
}

/**
 * Everything the dashboard draws, in one call. SCOPED exactly like the list:
 * admins get the org, everyone else gets their own sends — so a sender's
 * dashboard is a real dashboard of their own reach, not an empty shell.
 */
export async function getBroadcastAnalytics(): Promise<BroadcastAnalytics> {
  const { meId, admin } = await viewerScope();
  const mine = admin ? undefined : eq(broadcasts.authorId, meId);

  const totals = await getEcosOrgStats();

  // One pass over (broadcast × receipt) covers category, priority and per-item
  // read rates; the roster is small enough that grouping in SQL and shaping in
  // JS is cheaper to read than five more round trips.
  const perBroadcast = await db
    .select({
      id: broadcasts.id,
      title: broadcasts.title,
      category: broadcasts.category,
      priority: broadcasts.priority,
      status: broadcasts.status,
      authorName: employees.name,
      publishedAt: broadcasts.publishedAt,
      recipients: sql<number>`count(${broadcastRecipients.id})`,
      reads: sql<number>`count(*) filter (where ${broadcastRecipients.status} <> 'pending')`,
    })
    .from(broadcasts)
    .leftJoin(broadcastRecipients, eq(broadcastRecipients.broadcastId, broadcasts.id))
    .leftJoin(employees, eq(employees.id, broadcasts.authorId))
    .where(mine)
    .groupBy(
      broadcasts.id,
      broadcasts.title,
      broadcasts.category,
      broadcasts.priority,
      broadcasts.status,
      broadcasts.publishedAt,
      employees.name,
    );

  const rate = (reads: number, recipients: number) =>
    recipients > 0 ? Math.round((reads / recipients) * 100) : 0;

  type Bucket = { sent: number; recipients: number; reads: number };
  const catMap = new Map<string, Bucket>();
  const priMap = new Map<string, Bucket>();
  const senderMap = new Map<string, Bucket>();

  const add = (m: Map<string, Bucket>, key: string, recipients: number, reads: number) => {
    const cur = m.get(key) ?? { sent: 0, recipients: 0, reads: 0 };
    cur.sent += 1;
    cur.recipients += recipients;
    cur.reads += reads;
    m.set(key, cur);
  };

  for (const r of perBroadcast) {
    const recipients = Number(r.recipients) || 0;
    const reads = Number(r.reads) || 0;
    add(catMap, r.category, recipients, reads);
    add(priMap, r.priority, recipients, reads);
    if (admin) add(senderMap, r.authorName ?? "Unknown", recipients, reads);
  }

  const shape = <K extends string>(m: Map<string, Bucket>) =>
    [...m.entries()]
      .map(([key, b]) => ({
        key: key as K,
        sent: b.sent,
        recipients: b.recipients,
        reads: b.reads,
        readPct: rate(b.reads, b.recipients),
      }))
      .sort((a, b) => b.sent - a.sent);

  // Delivery per channel — `delivered_channels` is a jsonb array per receipt.
  const channelRows = await db
    .select({
      channel: sql<string>`jsonb_array_elements_text(${broadcastRecipients.deliveredChannels})`,
      delivered: sql<number>`count(*)`,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(mine)
    .groupBy(sql`1`);

  // Published-per-day for the last 30 days.
  //
  // BUCKETED IN JS, ON PURPOSE. Grouping by `to_char(published_at,'YYYY-MM-DD')`
  // buckets by the UTC day while the axis below is built from LOCAL days, and
  // the two disagree by one for every zone east of Greenwich — which is not a
  // rounding error, it is every bar reading zero, because no local key ever
  // matches a UTC key. Both halves now derive from the same local calendar day.
  const publishedRows = await db
    .select({ at: broadcasts.publishedAt })
    .from(broadcasts)
    .where(
      and(
        mine,
        sql`${broadcasts.publishedAt} is not null`,
        sql`${broadcasts.publishedAt} >= now() - interval '30 days'`,
      ),
    );

  /** Local calendar day as YYYY-MM-DD — never toISOString(), which is UTC. */
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const byDay = new Map<string, number>();
  for (const r of publishedRows) {
    if (!r.at) continue;
    const k = dayKey(new Date(r.at));
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }

  // Zero-filled so a quiet day gets a bar rather than being skipped.
  const timeline: Array<{ day: string; sent: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    timeline.push({ day: key, sent: byDay.get(key) ?? 0 });
  }

  // Median (not mean) time-to-open: one person opening a week late should not
  // drag the headline number the way an average does.
  const [openRow] = await db
    .select({
      median: sql<number | null>`percentile_cont(0.5) within group (
        order by extract(epoch from (
          coalesce(${broadcastRecipients.readAt}, ${broadcastRecipients.acknowledgedAt}) - ${broadcasts.publishedAt}
        )) / 60
      )`,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(
      and(
        mine,
        sql`${broadcasts.publishedAt} is not null`,
        sql`coalesce(${broadcastRecipients.readAt}, ${broadcastRecipients.acknowledgedAt}) is not null`,
      ),
    );

  const [snoozeRow] = await db
    .select({
      totalSnoozes: sql<number>`coalesce(sum(${broadcastRecipients.snoozeCount}), 0)`,
      people: sql<number>`count(*) filter (where ${broadcastRecipients.snoozeCount} > 0)`,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(mine);

  const worstRead = perBroadcast
    .filter((r) => r.status === "published" && Number(r.recipients) > 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      recipients: Number(r.recipients) || 0,
      reads: Number(r.reads) || 0,
      readPct: rate(Number(r.reads) || 0, Number(r.recipients) || 0),
    }))
    .sort((a, b) => a.readPct - b.readPct || b.recipients - a.recipients)
    .slice(0, 5);

  const medianRaw = openRow?.median;
  return {
    scope: admin ? "org" : "mine",
    totals,
    byCategory: shape<BroadcastCategory>(catMap),
    byPriority: shape<BroadcastPriority>(priMap),
    byChannel: channelRows
      .map((r) => ({ channel: r.channel, delivered: Number(r.delivered) || 0 }))
      .sort((a, b) => b.delivered - a.delivered),
    topSenders: [...senderMap.entries()]
      .map(([name, b]) => ({
        name,
        sent: b.sent,
        recipients: b.recipients,
        readPct: rate(b.reads, b.recipients),
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 8),
    timeline,
    medianOpenMinutes:
      medianRaw == null || Number.isNaN(Number(medianRaw)) ? null : Math.round(Number(medianRaw)),
    snoozes: {
      totalSnoozes: Number(snoozeRow?.totalSnoozes) || 0,
      recipientsWhoSnoozed: Number(snoozeRow?.people) || 0,
    },
    worstRead,
  };
}
