import "server-only";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts } from "@/db/schema";
import { publishBroadcastCore } from "@/lib/ecos/publish";
import { nextOccurrence } from "@/lib/ecos/recurrence";

/**
 * PUBLISH WHAT IS DUE — every scheduled broadcast whose time has come.
 *
 * Shared by the daily cron (/api/cron/ecos-publish) and the on-time trigger
 * (lib/ecos/publish-due-trigger), which the popup poll fires so a broadcast goes
 * out within about a minute of its scheduled time instead of at the next daily
 * run. Both can run at once, so each broadcast is CLAIMED before it is touched:
 * a conditional UPDATE that only one sweep can win. A claim older than
 * CLAIM_TTL_MS is treated as abandoned (a crashed sweep) and can be re-claimed.
 *
 * One-time broadcasts are published as they are. A repeating broadcast publishes
 * a fresh CLONE for this occurrence and re-arms the original for its next one
 * (lib/ecos/recurrence), or archives it when the repeat is over. A failed
 * publish keeps its claim, so it is retried after the TTL rather than every
 * poll.
 */

const CLAIM_TTL_MS = 10 * 60_000;

export interface PublishDueResult {
  due: number;
  published: number;
  recurred: number;
  errors: string[];
}

export async function publishDueBroadcasts(now: Date = new Date(), limit = 25): Promise<PublishDueResult> {
  const staleClaim = new Date(now.getTime() - CLAIM_TTL_MS);
  const claimable = and(
    eq(broadcasts.status, "scheduled"),
    lte(broadcasts.scheduledFor, now),
    or(isNull(broadcasts.publishClaimedAt), lt(broadcasts.publishClaimedAt, staleClaim)),
  );

  const candidates = await db
    .select({ id: broadcasts.id })
    .from(broadcasts)
    .where(claimable)
    .orderBy(asc(broadcasts.scheduledFor))
    .limit(limit);

  const result: PublishDueResult = { due: candidates.length, published: 0, recurred: 0, errors: [] };

  for (const { id } of candidates) {
    const [b] = await db
      .update(broadcasts)
      .set({ publishClaimedAt: now })
      .where(and(eq(broadcasts.id, id), claimable))
      .returning();
    if (!b) continue; // another sweep claimed it first

    try {
      if (b.recurrence === "none") {
        const res = await publishBroadcastCore(b.id, null);
        if (res.ok) result.published += 1;
        else result.errors.push(`${b.id}: ${res.error}`);
        continue;
      }

      // Repeating — publish a fresh clone for this occurrence.
      const [clone] = await db
        .insert(broadcasts)
        .values({
          title: b.title,
          bodyHtml: b.bodyHtml,
          bodyText: b.bodyText,
          category: b.category,
          priority: b.priority,
          ackMode: b.ackMode,
          requireLock: b.requireLock,
          authorId: b.authorId,
          authorIdentity: b.authorIdentity,
          senderName: b.senderName,
          attachments: b.attachments,
          audience: b.audience,
          channels: b.channels,
          poll: b.poll,
          popup: b.popup,
          reminderAfterDays: b.reminderAfterDays,
          escalateToManager: b.escalateToManager,
          status: "draft",
        })
        .returning({ id: broadcasts.id });

      if (clone) {
        const res = await publishBroadcastCore(clone.id, b.authorId);
        if (res.ok) {
          result.published += 1;
          result.recurred += 1;
        } else {
          result.errors.push(`${b.id} clone: ${res.error}`);
        }
      }

      // Re-arm the original for its next occurrence, or retire it.
      const next = nextOccurrence(b.scheduledFor ?? now, b.recurrence, now, {
        anchor: b.recurrenceAnchor,
        customDates: b.recurrenceDates,
      });
      const untilOk =
        next !== null && (!b.recurrenceUntil || next <= new Date(`${b.recurrenceUntil}T23:59:59+05:30`));
      await db
        .update(broadcasts)
        .set(
          untilOk
            ? { scheduledFor: next, lastRunAt: now, publishClaimedAt: null, updatedAt: now }
            : { status: "archived", lastRunAt: now, publishClaimedAt: null, updatedAt: now },
        )
        .where(eq(broadcasts.id, b.id));
    } catch (e) {
      result.errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
