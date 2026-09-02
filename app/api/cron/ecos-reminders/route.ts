import { NextResponse } from "next/server";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, employees } from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";
import { sendFcmToEmployee } from "@/lib/push/fcm";

/**
 * ECOS reminder + escalation cron (daily). For every published broadcast with a
 * `reminder_after_days` policy, it nudges recipients who STILL haven't read it
 * once the delay has elapsed, then again every `reminder_after_days` while they
 * stay unread. When `escalate_to_manager` is on, the recipient's manager is
 * looped in from the second reminder onward. Due strictly by date (no cron-hour
 * matching). Vercel sets the Bearer header.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const active = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.status, "published")));

  let reminded = 0;
  let escalated = 0;

  for (const b of active) {
    const days = b.reminderAfterDays ?? 0;
    if (days <= 0 || !b.publishedAt) continue;
    const cutoff = new Date(now.getTime() - days * DAY);
    if (b.publishedAt > cutoff) continue; // policy delay not elapsed yet

    // Pending recipients due for a (re)reminder.
    const pend = await db
      .select({
        employeeId: broadcastRecipients.employeeId,
        reminderCount: broadcastRecipients.reminderCount,
        name: employees.name,
        managerId: employees.managerId,
      })
      .from(broadcastRecipients)
      .innerJoin(employees, eq(employees.id, broadcastRecipients.employeeId))
      .where(
        and(
          eq(broadcastRecipients.broadcastId, b.id),
          eq(broadcastRecipients.status, "pending"),
          eq(employees.isActive, true),
          or(
            isNull(broadcastRecipients.lastRemindedAt),
            lte(broadcastRecipients.lastRemindedAt, cutoff),
          ),
        ),
      );

    const body = JSON.stringify({ broadcastId: b.id });

    for (const r of pend) {
      try {
        await notify({
          userId: r.employeeId,
          kind: "broadcast",
          title: `Reminder: ${b.title}`,
          body,
          forceChannels: [],
        });
        await sendFcmToEmployee(r.employeeId, {
          title: `Reminder: ${b.title}`,
          body: "Please read and acknowledge this.",
          route: `communication/${b.id}`,
        });
        reminded += 1;

        // Escalate to the manager from the second reminder onward.
        if (b.escalateToManager && r.reminderCount >= 1 && r.managerId) {
          await notify({
            userId: r.managerId,
            kind: "broadcast",
            title: `${r.name} still hasn't read: ${b.title}`,
            body,
            forceChannels: [],
          });
          escalated += 1;
        }

        await db
          .update(broadcastRecipients)
          .set({ lastRemindedAt: now, reminderCount: r.reminderCount + 1 })
          .where(
            and(
              eq(broadcastRecipients.broadcastId, b.id),
              eq(broadcastRecipients.employeeId, r.employeeId),
            ),
          );
      } catch {
        // Best-effort — one recipient's failure never aborts the sweep.
      }
    }
  }

  return NextResponse.json({ ok: true, reminded, escalated });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
