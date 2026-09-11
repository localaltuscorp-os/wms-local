"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, broadcastSegments, broadcastPollResponses, broadcastTemplates, type BroadcastPoll } from "@/db/schema";
import type { BroadcastCategory, BroadcastPriority, BroadcastAckMode } from "@/db/enums";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { resolveAudience, type AudienceRule } from "@/lib/ecos/audience";
import { publishBroadcastCore, deliverBroadcast } from "@/lib/ecos/publish";
import { canManageBroadcast, canUseAppLock, isBroadcastAdmin } from "@/lib/ecos/permissions";
import { sanitizeRichHtml } from "@/lib/security/sanitize-rich-html";
import type { SaveBroadcastDraftInput } from "./actions-types";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type VoidResult = { ok: true } | Err;

const LOCK_PRIORITIES = new Set(["critical", "emergency"]);

/**
 * Resolve the current employee for an authoring action.
 *
 * Every employee may send a broadcast (lib/ecos/permissions.ts) — this used to
 * be an HR-staff wall and is now just "you are signed in". The narrowing that
 * remains is per-BROADCAST, not per-person: {@link requireManager} below checks
 * that you own the specific message you are about to pause, archive or resend.
 */
async function requireAuthor(): Promise<{ me: Awaited<ReturnType<typeof requireUser>> } | Err> {
  const me = await requireUser();
  return { me };
}

/**
 * Gate an action that changes an EXISTING broadcast: its author may, and so may
 * a broadcast admin (super-admin / HR). Anyone else is refused — "everyone can
 * send" is not "everyone can retract someone else's message".
 */
async function requireManager(
  id: string,
): Promise<{ me: Awaited<ReturnType<typeof requireUser>>; broadcast: typeof broadcasts.$inferSelect } | Err> {
  const me = await requireUser();
  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  if (!broadcast) return { ok: false, error: "That broadcast no longer exists." };
  if (!(await canManageBroadcast(me, broadcast.authorId))) {
    return { ok: false, error: "Only the person who sent this broadcast (or HR) can change it." };
  }
  return { me, broadcast };
}

/* ------------------------------------------------------------------ */
/* Compose / lifecycle                                                  */
/* ------------------------------------------------------------------ */

/** Create or update a broadcast draft. HR-staff only. */
export async function saveBroadcastDraft(
  input: SaveBroadcastDraftInput,
): Promise<Ok<{ id: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const { me } = gate;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Give the broadcast a subject." };

  // App-lock is reserved for the two highest priorities.
  if (input.requireLock && !LOCK_PRIORITIES.has(input.priority)) {
    return {
      ok: false,
      error: "The app-lock gate is only available for Critical or Emergency broadcasts.",
    };
  }
  // …and for broadcast admins. It freezes the whole app for every recipient
  // until they acknowledge, which is not a control to hand to every sender.
  if (input.requireLock && !(await canUseAppLock(me))) {
    return { ok: false, error: "Only HR can lock the app until a broadcast is acknowledged." };
  }

  const sched = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const values = {
    title,
    // Sanitise stored HTML — it is rendered with dangerouslySetInnerHTML into
    // every recipient's browser (incl. the login lock-gate), so an unsanitised
    // body is a stored-XSS vector against everyone, super-admins included.
    bodyHtml: sanitizeRichHtml(input.bodyHtml),
    bodyText: input.bodyText ?? "",
    category: input.category,
    priority: input.priority,
    ackMode: input.ackMode,
    requireLock: input.requireLock,
    authorIdentity: input.authorIdentity,
    senderName: input.senderName?.trim() || null,
    attachments: input.attachments ?? [],
    audience: input.audience ?? { scope: "org" },
    channels: input.channels && input.channels.length > 0 ? input.channels : ["in_app", "email"],
    scheduledFor: sched && !Number.isNaN(sched.getTime()) ? sched : null,
    recurrence: input.recurrence ?? "none",
    recurrenceUntil: input.recurrenceUntil || null,
    reminderAfterDays:
      input.reminderAfterDays && input.reminderAfterDays > 0 ? input.reminderAfterDays : null,
    escalateToManager: input.escalateToManager ?? false,
    poll: input.poll ?? null,
    popup: input.popup ?? true,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      // Only drafts / scheduled broadcasts remain editable — and only by
      // someone entitled to manage that broadcast.
      const [existing] = await db
        .select({ status: broadcasts.status, authorId: broadcasts.authorId })
        .from(broadcasts)
        .where(eq(broadcasts.id, input.id))
        .limit(1);
      if (!existing) return { ok: false, error: "That broadcast no longer exists." };
      if (!(await canManageBroadcast(me, existing.authorId))) {
        return { ok: false, error: "That draft belongs to someone else." };
      }
      if (existing.status !== "draft" && existing.status !== "scheduled") {
        return { ok: false, error: "A published broadcast can't be edited." };
      }
      await db.update(broadcasts).set(values).where(eq(broadcasts.id, input.id));
      return { ok: true, id: input.id };
    }

    const [row] = await db
      .insert(broadcasts)
      .values({ ...values, status: "draft", authorId: me.id })
      .returning({ id: broadcasts.id });
    if (!row) return { ok: false, error: "Could not save the draft." };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the draft." };
  }
}

/**
 * Publish a broadcast: resolve its audience, snapshot `broadcast_recipients`,
 * flip to published, then deliver in-app + email per recipient. Delivery is
 * best-effort and per-recipient try/catch — one failure never aborts the rest.
 */
export async function publishBroadcast(
  id: string,
): Promise<Ok<{ recipientCount: number }> | Err> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const { me } = gate;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  return publishBroadcastCore(id, me.id);
}

/**
 * Duplicate a broadcast into a fresh DRAFT owned by the person duplicating it.
 *
 * Copies the content, the audience, the channels and the delivery settings —
 * and deliberately NOT the status, the schedule, the publish timestamp or a
 * single receipt: a duplicate is a new message that happens to start from an
 * old one's words, not a second copy of a send that already happened. The
 * app-lock flag is dropped unless the duplicator is entitled to raise one, so
 * copying an HR lock-mode notice cannot smuggle that power sideways.
 *
 * Readable-then-copyable: you can duplicate any broadcast you can OPEN (yours,
 * or any if you are an admin), which is what makes "resend last month's notice
 * with two words changed" a five-second job.
 */
export async function duplicateBroadcast(id: string): Promise<Ok<{ id: string }> | Err> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const src = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  if (!src) return { ok: false, error: "That broadcast no longer exists." };
  if (!(await canManageBroadcast(me, src.authorId))) {
    return { ok: false, error: "You can only duplicate broadcasts you sent." };
  }

  const keepLock = src.requireLock && (await canUseAppLock(me));

  try {
    const [row] = await db
      .insert(broadcasts)
      .values({
        title: `${src.title} (copy)`.slice(0, 200),
        bodyHtml: src.bodyHtml,
        bodyText: src.bodyText,
        category: src.category,
        priority: src.priority,
        ackMode: src.ackMode,
        requireLock: keepLock,
        authorId: me.id,
        authorIdentity: src.authorIdentity,
        senderName: src.senderName,
        attachments: src.attachments,
        audience: src.audience,
        channels: src.channels,
        poll: src.poll,
        popup: src.popup,
        reminderAfterDays: src.reminderAfterDays,
        escalateToManager: src.escalateToManager,
        recurrence: src.recurrence,
        recurrenceUntil: src.recurrenceUntil,
        status: "draft",
      })
      .returning({ id: broadcasts.id });
    if (!row) return { ok: false, error: "Could not duplicate the broadcast." };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not duplicate the broadcast." };
  }
}

/**
 * Queue a saved broadcast for later — sets status "scheduled". The daily
 * `/api/cron/ecos-publish` job publishes it once `scheduled_for` is due, and
 * re-arms it for the next occurrence when it recurs.
 */
export async function scheduleBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const b = gate.broadcast;
  if (b.status === "published" || b.status === "archived") {
    return { ok: false, error: "Only a draft can be scheduled." };
  }
  if (!b.title.trim()) return { ok: false, error: "Give the broadcast a title first." };
  if (!b.scheduledFor) return { ok: false, error: "Pick a date & time to schedule for." };
  if (b.recurrence === "none" && b.scheduledFor.getTime() <= Date.now()) {
    return { ok: false, error: "That time is in the past — publish now instead." };
  }
  try {
    await db
      .update(broadcasts)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not schedule the broadcast." };
  }
}

/**
 * Archive a broadcast. It leaves the active list and stops popping up, but
 * every receipt is kept — archiving is how an old notice is retired, not how it
 * is deleted, so the read analytics for it survive.
 */
export async function archiveBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db
      .update(broadcasts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive." };
  }
}

/** Bring an archived broadcast back to published (it re-enters the active list). */
export async function unarchiveBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  const b = gate.broadcast;
  if (b.status !== "archived") return { ok: false, error: "That broadcast isn't archived." };
  // A never-published broadcast goes back to draft; one that WAS published
  // returns to published so its receipts keep meaning what they meant.
  const next = b.publishedAt ? "published" : "draft";
  try {
    await db
      .update(broadcasts)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not restore." };
  }
}

/**
 * Archive every published broadcast older than `days` that the caller is
 * entitled to manage. The "clear out the old notices" button — bounded to the
 * caller's own sends unless they are an admin, and never touching a draft, a
 * scheduled send or anything still inside the window.
 */
export async function archiveOldBroadcasts(days: number): Promise<Ok<{ archived: number }> | Err> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const n = Math.max(1, Math.min(3650, Math.round(days)));
  const cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const admin = await isBroadcastAdmin(me);

  try {
    const rows = await db
      .update(broadcasts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(broadcasts.status, "published"),
          lt(broadcasts.publishedAt, cutoff),
          admin ? undefined : eq(broadcasts.authorId, me.id),
        ),
      )
      .returning({ id: broadcasts.id });
    return { ok: true, archived: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive." };
  }
}

/** Pause a published broadcast (stops it counting toward gates; receipts kept). */
export async function pauseBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db
      .update(broadcasts)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not pause." };
  }
}

/** Re-notify recipients who are still pending (delivered but not yet read). */
export async function resendToUnread(id: string): Promise<Ok<{ resent: number }> | Err> {
  const gate = await requireManager(id);
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const pending = await db
    .select({ employeeId: broadcastRecipients.employeeId })
    .from(broadcastRecipients)
    .where(
      and(
        eq(broadcastRecipients.broadcastId, id),
        eq(broadcastRecipients.status, "pending"),
      ),
    );

  const ids = pending.map((p) => p.employeeId);
  if (ids.length === 0) return { ok: true, resent: 0 };

  await deliverBroadcast(id, ids);
  return { ok: true, resent: ids.length };
}

/** Composer live-count — resolve an (unsaved) audience rule to a headcount. */
export async function previewAudienceCount(rule: AudienceRule): Promise<{ count: number }> {
  await requireUser();
  try {
    const { count } = await resolveAudience(rule);
    return { count };
  } catch {
    return { count: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Recipient-side receipts                                              */
/* ------------------------------------------------------------------ */

/** The current user marks a broadcast read. Idempotent; never downgrades ack. */
export async function markBroadcastRead(broadcastId: string): Promise<{ ok: boolean }> {
  try {
    const me = await requireUser();
    await db
      .update(broadcastRecipients)
      .set({ status: "read", readAt: new Date(), popupSeenAt: new Date() })
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
          // Only pending → read, so we never clobber an existing acknowledgement.
          eq(broadcastRecipients.status, "pending"),
        ),
      );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * The current user SNOOZES a broadcast's centre-screen popup — the "X" in its
 * top-right corner.
 *
 * Snoozing is not dismissing: the receipt stays `pending` (so the message is
 * still unread, still counted as unread in the sender's analytics, and still in
 * the inbox) and the popup comes back at the recipient's NEXT LOGIN. What is
 * stored is the browser-session id it was waved away in; the popup query
 * re-admits it as soon as the session id it is asked with differs. `snoozeCount`
 * accumulates, so a sender can see a message people keep closing.
 *
 * Silent on failure — this is fired from a modal the user is closing, and a
 * failed write means at worst the popup returns sooner than they expected.
 */
export async function snoozeBroadcast(
  broadcastId: string,
  sessionId: string,
): Promise<{ ok: boolean }> {
  try {
    const me = await requireUser();
    const session = (sessionId ?? "").trim().slice(0, 100);
    if (!session) return { ok: false };
    await db
      .update(broadcastRecipients)
      .set({
        snoozedAt: new Date(),
        snoozeSession: session,
        snoozeCount: sql`${broadcastRecipients.snoozeCount} + 1`,
        popupSeenAt: new Date(),
      })
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
          // Only a still-unread receipt can be snoozed — never walk a read or
          // acknowledged receipt backwards into "waiting to be shown".
          eq(broadcastRecipients.status, "pending"),
        ),
      );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The current user acknowledges a broadcast (satisfies the app-lock gate). */
export async function acknowledgeBroadcast(
  broadcastId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await requireUser();
    const [rec] = await db
      .select({ readAt: broadcastRecipients.readAt })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
        ),
      )
      .limit(1);
    if (!rec) return { ok: false, error: "This message wasn't sent to you." };

    const now = new Date();
    await db
      .update(broadcastRecipients)
      .set({ status: "acknowledged", acknowledgedAt: now, readAt: rec.readAt ?? now })
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not acknowledge." };
  }
}

/* ------------------------------------------------------------------ */
/* AI compose assistant                                                 */
/* ------------------------------------------------------------------ */

/** HR-gated AI writing assistant (generate / rewrite / translate / summarize). */
export async function aiComposeAssistant(input: {
  action: "generate" | "rewrite" | "translate" | "summarize";
  text?: string;
  prompt?: string;
  language?: string;
}): Promise<Ok<{ text: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  // Imported lazily so a missing OpenRouter key never affects the other actions.
  const { composeWithAI } = await import("@/lib/ecos/ai");
  const result = await composeWithAI(input);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: result.text };
}

/* ------------------------------------------------------------------ */
/* Saved audience segments (Phase 2)                                    */
/* ------------------------------------------------------------------ */

/** Save the current audience rule as a reusable named segment. HR-only. */
export async function saveBroadcastSegment(
  name: string,
  rule: AudienceRule,
): Promise<Ok<{ id: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name the segment first." };
  try {
    const [row] = await db
      .insert(broadcastSegments)
      .values({ name: clean, rule, createdById: gate.me.id })
      .returning({ id: broadcastSegments.id });
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the segment." };
  }
}

/** Delete a saved segment. HR-only. */
export async function deleteBroadcastSegment(id: string): Promise<VoidResult> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db.delete(broadcastSegments).where(eq(broadcastSegments.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the segment." };
  }
}

/* ------------------------------------------------------------------ */
/* Inline poll / quiz (Phase 2)                                         */
/* ------------------------------------------------------------------ */

/**
 * An employee answers a broadcast's inline poll/quiz. Must be a recipient. One
 * response per person (first answer stands — matters for quiz integrity).
 * Returns whether the choice was correct when the broadcast is a quiz.
 */
export async function submitPollResponse(
  broadcastId: string,
  optionIndex: number,
): Promise<Ok<{ correct: boolean | null }> | Err> {
  const me = await requireUser();

  const receipt = await db.query.broadcastRecipients.findFirst({
    where: and(
      eq(broadcastRecipients.broadcastId, broadcastId),
      eq(broadcastRecipients.employeeId, me.id),
    ),
  });
  if (!receipt) return { ok: false, error: "This isn't addressed to you." };

  const b = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, broadcastId) });
  const poll = (b?.poll ?? null) as BroadcastPoll | null;
  if (!poll) return { ok: false, error: "This broadcast has no poll." };
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return { ok: false, error: "Pick a valid option." };
  }

  try {
    await db
      .insert(broadcastPollResponses)
      .values({ broadcastId, employeeId: me.id, optionIndex })
      .onConflictDoNothing();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record your answer." };
  }

  const correct = poll.mode === "quiz" && typeof poll.correctIndex === "number"
    ? optionIndex === poll.correctIndex
    : null;
  return { ok: true, correct };
}

/* ------------------------------------------------------------------ */
/* Reusable templates (Phase 3)                                         */
/* ------------------------------------------------------------------ */

export interface SaveTemplateInput {
  name: string;
  title: string;
  bodyHtml: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  ackMode: BroadcastAckMode;
  channels: string[];
}

/** Save the current composer content as a reusable template. HR-only. */
export async function saveBroadcastTemplate(
  input: SaveTemplateInput,
): Promise<Ok<{ id: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name the template first." };
  try {
    const [row] = await db
      .insert(broadcastTemplates)
      .values({
        name,
        title: input.title.trim(),
        bodyHtml: sanitizeRichHtml(input.bodyHtml),
        category: input.category,
        priority: input.priority,
        ackMode: input.ackMode,
        channels: input.channels.length ? input.channels : ["in_app", "email"],
        createdById: gate.me.id,
      })
      .returning({ id: broadcastTemplates.id });
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the template." };
  }
}

/** Delete a saved template. HR-only. */
export async function deleteBroadcastTemplate(id: string): Promise<VoidResult> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db.delete(broadcastTemplates).where(eq(broadcastTemplates.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the template." };
  }
}
