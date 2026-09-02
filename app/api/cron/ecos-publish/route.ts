import { NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts } from "@/db/schema";
import { publishBroadcastCore } from "@/lib/ecos/publish";
import type { BroadcastRecurrence } from "@/db/enums";

/**
 * ECOS scheduled-publish cron (daily). Publishes every broadcast whose status is
 * "scheduled" and whose `scheduled_for` is now due. Recurring broadcasts publish
 * a fresh CLONE each period and the original re-arms to its next occurrence
 * (stopping at `recurrence_until`). Idempotent: publishes strictly by due date,
 * so a missed day catches up on the next run (no reliance on the cron HOUR
 * matching — the classic silent-dead-cron trap). Vercel sets the Bearer header.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Next fire time for a recurrence, from the previous scheduled_for. */
function nextOccurrence(from: Date, rec: BroadcastRecurrence): Date {
  const d = new Date(from);
  if (rec === "daily") d.setDate(d.getDate() + 1);
  else if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.status, "scheduled"), lte(broadcasts.scheduledFor, now)));

  let published = 0;
  let recurred = 0;
  const errors: string[] = [];

  for (const b of due) {
    try {
      if (b.recurrence === "none") {
        const res = await publishBroadcastCore(b.id, null);
        if (res.ok) published += 1;
        else errors.push(`${b.id}: ${res.error}`);
        continue;
      }

      // Recurring — publish a fresh clone for this occurrence.
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
          reminderAfterDays: b.reminderAfterDays,
          escalateToManager: b.escalateToManager,
          status: "draft",
        })
        .returning({ id: broadcasts.id });

      if (clone) {
        const res = await publishBroadcastCore(clone.id, b.authorId);
        if (res.ok) {
          published += 1;
          recurred += 1;
        } else {
          errors.push(`${b.id} clone: ${res.error}`);
        }
      }

      // Re-arm the recurring original to its next occurrence, or retire it.
      const base = b.scheduledFor ?? now;
      const next = nextOccurrence(base, b.recurrence);
      const untilOk = !b.recurrenceUntil || next <= new Date(`${b.recurrenceUntil}T23:59:59`);
      await db
        .update(broadcasts)
        .set(
          untilOk
            ? { scheduledFor: next, lastRunAt: now, updatedAt: now }
            : { status: "archived", lastRunAt: now, updatedAt: now },
        )
        .where(eq(broadcasts.id, b.id));
    } catch (e) {
      errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, published, recurred, errors });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
