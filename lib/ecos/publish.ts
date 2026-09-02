import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, employees } from "@/db/schema";
import type { BroadcastAuthorIdentity } from "@/db/enums";
import { notify } from "@/lib/notifications/dispatch";
import { sendBroadcastEmail } from "@/lib/email/resend";
import { sendFcmToEmployee } from "@/lib/push/fcm";
import { emit } from "@/lib/events/emit";
import { resolveAudience, type AudienceRule } from "@/lib/ecos/audience";

/**
 * ECOS publish CORE — the un-gated engine shared by the HR `publishBroadcast`
 * action AND the scheduling cron. It resolves the audience, snapshots
 * `broadcast_recipients`, flips the broadcast to `published`, and fans it out
 * (in-app + email + push, best-effort per recipient). Callers own their OWN
 * authorization: the action gates on HR-staff; the cron gates on CRON_SECRET.
 */

type CoreResult = { ok: true; recipientCount: number } | { ok: false; error: string };

/** Normalise the stored `channels` JSONB into a clean string[] (with defaults). */
export function normChannels(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out = raw.filter((x): x is string => typeof x === "string");
    return out.length > 0 ? out : ["in_app", "email"];
  }
  return ["in_app", "email"];
}

/** Human sender label for the email header / display identity. */
export function senderLabelFor(b: {
  authorIdentity: BroadcastAuthorIdentity;
  senderName: string | null;
}): string {
  if (b.senderName && b.senderName.trim()) return b.senderName.trim();
  switch (b.authorIdentity) {
    case "ceo":
      return "The CEO";
    case "founder":
      return "The Founder";
    default:
      return "Altus HR";
  }
}

/**
 * Publish a broadcast by id: resolve audience → snapshot recipients → flip to
 * published → deliver. Idempotent-ish: refuses an already-published/archived
 * broadcast. `actorId` is stamped on the audit event (null for the cron).
 */
export async function publishBroadcastCore(id: string, actorId: string | null): Promise<CoreResult> {
  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  if (!broadcast) return { ok: false, error: "That broadcast no longer exists." };
  if (broadcast.status === "published") return { ok: false, error: "This broadcast is already published." };
  if (broadcast.status === "archived") return { ok: false, error: "An archived broadcast can't be published." };
  if (!broadcast.title.trim()) return { ok: false, error: "Give the broadcast a title first." };

  let targetIds: string[] = [];
  try {
    const resolved = await resolveAudience((broadcast.audience ?? { scope: "org" }) as AudienceRule);
    targetIds = resolved.employeeIds;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not resolve the audience." };
  }
  if (targetIds.length === 0) return { ok: false, error: "This audience resolves to zero active employees." };

  const publishedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(broadcastRecipients)
        .values(targetIds.map((employeeId) => ({ broadcastId: id, employeeId, status: "pending" as const })))
        .onConflictDoNothing();

      await tx
        .update(broadcasts)
        .set({ status: "published", publishedAt, recipientCount: targetIds.length, updatedAt: new Date() })
        .where(eq(broadcasts.id, id));

      await emit(tx, {
        aggregateType: "broadcast",
        aggregateId: id,
        eventType: "BroadcastPublished",
        eventVersion: 1,
        payload: {
          title: broadcast.title,
          category: broadcast.category,
          priority: broadcast.priority,
          ackMode: broadcast.ackMode,
          requireLock: broadcast.requireLock,
          recipientCount: targetIds.length,
        },
        actorId,
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not publish the broadcast." };
  }

  await deliverBroadcast(id, targetIds);
  return { ok: true, recipientCount: targetIds.length };
}

/**
 * Fan a broadcast out to a set of employees. In-app row via notify()
 * (forceChannels: [] → inbox row only); email via sendBroadcastEmail; push via
 * direct FCM (NOT notify, so no duplicate inbox row). Best-effort per recipient.
 */
export async function deliverBroadcast(broadcastId: string, employeeIds: string[]): Promise<void> {
  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, broadcastId) });
  if (!broadcast) return;

  const channels = normChannels(broadcast.channels);
  const wantInApp = channels.includes("in_app");
  const wantEmail = channels.includes("email");
  const wantPush = channels.includes("push");
  const title = broadcast.title;
  const senderLabel = senderLabelFor(broadcast);
  const pushBody =
    (broadcast.bodyText || "").trim().replace(/\s+/g, " ").slice(0, 140) ||
    `New ${broadcast.category} from ${senderLabel}`;
  const requireAck = broadcast.ackMode === "acknowledge";
  const body = JSON.stringify({ broadcastId });

  const targets = employeeIds.length
    ? await db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(and(eq(employees.isActive, true), inArray(employees.id, employeeIds)))
    : [];

  await Promise.allSettled(
    targets.map(async (c) => {
      try {
        const deliveredChannels: string[] = [];

        if (wantInApp) {
          await notify({ userId: c.id, kind: "broadcast", title, body, forceChannels: [] });
          deliveredChannels.push("in_app");
        }
        if (wantEmail && c.email) {
          const res = await sendBroadcastEmail({
            to: c.email,
            subject: title,
            bodyHtml: broadcast.bodyHtml,
            bodyText: broadcast.bodyText,
            senderLabel,
            priority: broadcast.priority,
            requireAck,
            broadcastId,
          });
          if (!res.error) deliveredChannels.push("email");
        }
        if (wantPush) {
          await sendFcmToEmployee(c.id, { title, body: pushBody, route: `communication/${broadcastId}` });
          deliveredChannels.push("push");
        }

        await db
          .update(broadcastRecipients)
          .set({ deliveredAt: new Date(), deliveredChannels })
          .where(and(eq(broadcastRecipients.broadcastId, broadcastId), eq(broadcastRecipients.employeeId, c.id)));
      } catch {
        // Best-effort — a single recipient's failure never aborts the fan-out.
      }
    }),
  );
}
