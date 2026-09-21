import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts } from "@/db/schema";
import { publishDueBroadcasts } from "@/lib/ecos/publish-due";

/**
 * ON-TIME SCHEDULED BROADCASTS, without a minute-level cron.
 *
 * Vercel crons here run once a day, which used to mean a broadcast scheduled
 * for 3pm went out at the next morning's run. Every signed-in tab already polls
 * /api/broadcasts/popup every few seconds, so that route calls this after its
 * response is sent (next/server `after`). At most one check per MIN_GAP_MS per
 * server instance: a cheap "anything due?" read, and the full sweep only when
 * the answer is yes. Errors are logged and swallowed — the poll must never pay
 * for them.
 *
 * Limitation, by design: when nobody has the app open, nothing polls, and the
 * daily cron remains the backstop.
 */

const MIN_GAP_MS = 30_000;

let lastCheckAt = 0;
let inFlight: Promise<void> | null = null;

export function maybePublishDue(): Promise<void> {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (now - lastCheckAt < MIN_GAP_MS) return Promise.resolve();
  lastCheckAt = now;

  inFlight = (async () => {
    try {
      const [due] = await db
        .select({ id: broadcasts.id })
        .from(broadcasts)
        .where(and(eq(broadcasts.status, "scheduled"), lte(broadcasts.scheduledFor, new Date())))
        .limit(1);
      if (due) await publishDueBroadcasts();
    } catch (err) {
      console.error("[ecos] scheduled-publish sweep failed", err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
