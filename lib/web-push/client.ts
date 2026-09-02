import "server-only";
import * as webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions, type NotificationKind } from "@/db/schema";
import { buildPushPayload, type PushCtx } from "@/lib/web-push/payload";

/**
 * M4 Commit 3c — server-side Web Push fan-out.
 *
 * Replaces the Commit-2 stub.  For a given recipient `userId`, this:
 *   1. Lazy-configures `web-push` with the VAPID triple (subject + pub + pri)
 *      on first call.  When any of the three env vars is missing, every
 *      future call short-circuits to `"skip"`.
 *   2. Loads every `push_subscriptions` row owned by the user.  An empty
 *      result is `"skip"` (the user simply hasn't opted in on any device).
 *   3. Encrypts + sends the payload to each endpoint under
 *      `Promise.allSettled`, so one dead endpoint never poisons the others.
 *   4. Garbage-collects endpoints that return 404 / 410 — those are the
 *      "subscription invalidated" signals from FCM/APNS.  We DELETE those
 *      rows in the same pass so future notifications don't keep retrying.
 *   5. Returns `"sent"` if at least one fulfilled, `"skip"` otherwise.
 *      The dispatcher's `delivered_channels` stamping consumes this.
 *
 * Channel failures NEVER throw — the dispatcher's outer `safeSend` would
 * catch them anyway, but we keep this contract honest so a bad VAPID key
 * doesn't show up as a fulfilled rejection in test mocks.
 */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const pri = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT;
  if (!pub || !pri || !sub) return false;
  try {
    webpush.setVapidDetails(sub, pub, pri);
    configured = true;
    return true;
  } catch {
    // Malformed keys — treat the channel as unconfigured.
    return false;
  }
}

interface WebPushErrorLike {
  statusCode?: number;
}

export async function sendWebPushToUser(
  userId: string,
  kind: NotificationKind,
  ctx: PushCtx,
): Promise<"sent" | "skip"> {
  if (!ensureConfigured()) return "skip";

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return "skip";

  const payload = JSON.stringify(buildPushPayload(kind, ctx));

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
        );
      } catch (err) {
        const e = err as WebPushErrorLike;
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          // Subscription has been invalidated server-side — drop the row
          // so the next dispatch doesn't try again.
          try {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, s.id));
          } catch {
            // Cleanup failure is non-fatal — better to ship the channel
            // result than retry inline.
          }
        }
        throw err;
      }
    }),
  );

  return results.some((r) => r.status === "fulfilled") ? "sent" : "skip";
}
