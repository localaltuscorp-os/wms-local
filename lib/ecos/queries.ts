import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, broadcastSegments, broadcastPollResponses, broadcastTemplates, employees, type Broadcast, type BroadcastRecipient, type BroadcastTemplate } from "@/db/schema";
import type { AudienceRule } from "@/lib/ecos/audience";
import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
  BroadcastRecipientStatus,
} from "@/db/enums";
import { requireHrStaff } from "@/lib/hr/access";

/**
 * Enterprise Communications (ECOS, migration 0179) — read model.
 *
 * Author-facing queries (`listBroadcasts`, `getBroadcastWithStats`) are
 * HR-gated (super-admins + the HR department). Employee-facing queries take an
 * explicit `employeeId` and are NOT gated here — the calling page/action owns
 * the "this is me" check.
 */

export interface BroadcastListItem {
  id: string;
  title: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  status: BroadcastStatus;
  recipientCount: number;
  readCount: number;
  ackCount: number;
  publishedAt: Date | null;
  authorName: string | null;
}

/** Author/admin dashboard list — every broadcast with live read/ack rollups. */
export async function listBroadcasts(): Promise<BroadcastListItem[]> {
  await requireHrStaff();

  const rows = await db
    .select({
      id: broadcasts.id,
      title: broadcasts.title,
      category: broadcasts.category,
      priority: broadcasts.priority,
      status: broadcasts.status,
      recipientCount: broadcasts.recipientCount,
      publishedAt: broadcasts.publishedAt,
      createdAt: broadcasts.createdAt,
      authorName: employees.name,
    })
    .from(broadcasts)
    .leftJoin(employees, eq(broadcasts.authorId, employees.id))
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
      recipientCount: r.recipientCount,
      readCount: c?.readCount ?? 0,
      ackCount: c?.ackCount ?? 0,
      publishedAt: r.publishedAt,
      authorName: r.authorName,
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
  status: BroadcastRecipientStatus;
  deliveredAt: Date | null;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  deliveredChannels: string[];
}

/** Full author view of one broadcast: the row, delivery stats, per-recipient list. */
export async function getBroadcastWithStats(id: string): Promise<{
  broadcast: Broadcast;
  stats: BroadcastStats;
  recipients: BroadcastRecipientRow[];
} | null> {
  await requireHrStaff();

  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, id),
  });
  if (!broadcast) return null;

  const recipRows = await db
    .select({
      employeeId: broadcastRecipients.employeeId,
      name: employees.name,
      email: employees.email,
      status: broadcastRecipients.status,
      deliveredAt: broadcastRecipients.deliveredAt,
      readAt: broadcastRecipients.readAt,
      acknowledgedAt: broadcastRecipients.acknowledgedAt,
      deliveredChannels: broadcastRecipients.deliveredChannels,
    })
    .from(broadcastRecipients)
    .innerJoin(employees, eq(employees.id, broadcastRecipients.employeeId))
    .where(eq(broadcastRecipients.broadcastId, id))
    .orderBy(employees.name);

  const recips: BroadcastRecipientRow[] = recipRows.map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    email: r.email,
    status: r.status,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
    acknowledgedAt: r.acknowledgedAt,
    deliveredChannels: Array.isArray(r.deliveredChannels)
      ? (r.deliveredChannels as string[])
      : [],
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

/** All saved audience segments, alphabetical. HR-gated. */
export async function listBroadcastSegments(): Promise<SegmentRow[]> {
  await requireHrStaff();
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

/** All reusable broadcast templates, newest first. HR-gated. */
export async function listBroadcastTemplates(): Promise<BroadcastTemplate[]> {
  await requireHrStaff();
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

/** Org-wide ECOS rollup for the HR analytics header. HR-gated. */
export async function getEcosOrgStats(): Promise<EcosOrgStats> {
  await requireHrStaff();

  const [bStats] = await db
    .select({
      total: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${broadcasts.status} = 'published')`,
      scheduled: sql<number>`count(*) filter (where ${broadcasts.status} = 'scheduled')`,
      drafts: sql<number>`count(*) filter (where ${broadcasts.status} = 'draft')`,
    })
    .from(broadcasts);

  const [rStats] = await db
    .select({
      recipients: sql<number>`count(*)`,
      reads: sql<number>`count(*) filter (where ${broadcastRecipients.status} <> 'pending')`,
      acks: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'acknowledged')`,
    })
    .from(broadcastRecipients);

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
