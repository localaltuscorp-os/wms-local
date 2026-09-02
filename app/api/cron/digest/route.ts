import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees, notifications } from "@/lib/db";
import { listPendingByEmployee } from "@/lib/queries/overdue";
import { sendDigestEmail } from "@/lib/email/resend";
import { getRecipientChannelPrefs } from "@/lib/notifications/channel-prefs";
import { sendSlackDigest } from "@/lib/slack/dispatch";
import { sendWhatsAppDigest } from "@/lib/whatsapp/dispatch";
import { getOrgSettings } from "@/lib/queries/org-settings";

/**
 * Daily overdue-task digest cron.
 *
 * Vercel Cron hits this route hourly (configured in `vercel.json`); the
 * handler reads `org_settings.digest_hour_ist` and only proceeds when the
 * current IST hour matches, so admins can change the send time from the
 * settings UI without a redeploy.  For every active employee with ≥1
 * overdue, pending, non-archived task, we:
 *
 *   1. Insert a `notifications` row with kind = `overdue_digest`, title
 *      "You have <N> overdue tasks", body = first-3-subject preview.
 *   2. Send a digest email via `sendDigestEmail()` (owned by Agent B's
 *      M2.3 email-templates track).  Send failures are logged but don't
 *      poison the rest of the run.
 *
 * Authentication: requires `Authorization: Bearer <CRON_SECRET>`.  Vercel
 * Cron sets this header automatically when `CRON_SECRET` is configured in
 * the project's environment.  Local devs can curl the route with:
 *
 *   curl -X POST http://localhost:3000/api/cron/digest \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Both GET (Vercel's default) and POST (testability) are accepted.  The
 * route runs on the Node runtime because postgres-js needs Node APIs.
 *
 * Notification table: this route writes to the `notifications` table
 * landed by Agent A's M2.3 notifications-data track.  Recipient column
 * is `user_id` (NOT `recipient_id`).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DigestResult {
  ok: true;
  processed: number;
  sent: number;
  skipped: number;
}

interface DigestSkippedOffHour {
  ok: true;
  skipped: "off_hour";
  istHour: number;
  digestHourIst: number;
}

function getIstHour(now: Date): number {
  // IST is UTC+05:30, no DST. Add 330 minutes, then read the UTC hour.
  const istMs = now.getTime() + 330 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

/**
 * Race a promise against a timer. Used in the cron digest loop so a
 * hung Slack / WhatsApp / SMTP call can't sit forever and starve the
 * Vercel function timeout — we'd rather skip a delivery and log it.
 * The timer is `.unref()`ed so it doesn't keep the Node event loop
 * alive on its own.
 */
const SEND_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function runDigest(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const settings = await getOrgSettings();
  const istHour = getIstHour(now);
  if (istHour !== settings.digestHourIst) {
    return NextResponse.json<DigestSkippedOffHour>({
      ok: true,
      skipped: "off_hour",
      istHour,
      digestHourIst: settings.digestHourIst,
    });
  }

  const pendingByEmployee = await listPendingByEmployee(now);

  // Consider every ACTIVE employee, then (in the loop) skip anyone with zero
  // pending tasks — no all-clear noise on any channel. Recipients who DO have
  // pending tasks get the digest regardless of per-user opt-out.
  const activeEmployees = await db
    .select({ id: employees.id, email: employees.email, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true));

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const recipient of activeEmployees) {
    const pendingTasks = pendingByEmployee.get(recipient.id) ?? [];
    processed++;

    const count = pendingTasks.length;
    // No pending tasks → send nothing on any channel. A daily "all clear" ping
    // just fills the inbox and mailbox with noise, so skip these recipients
    // entirely (Slack/WhatsApp already did).
    if (count === 0) {
      skipped++;
      continue;
    }

    const previewSubjects = pendingTasks.slice(0, 3).map((t) => t.subject).join(", ");

    // 1) In-app notification row (reuse the overdue_digest kind).
    try {
      await db.insert(notifications).values({
        userId: recipient.id,
        kind: "overdue_digest",
        title: `You have ${count} pending task${count === 1 ? "" : "s"}`,
        body: previewSubjects || null,
        taskId: null,
        eventId: null,
        actorId: null,
      });
    } catch (err) {
      console.error(`[cron/digest] notification insert failed for ${recipient.id}`, err);
    }

    // 2) Email — sent to everyone with ≥1 pending task, regardless of opt-out
    //    (mandatory morning briefing).
    try {
      const result = await withTimeout(
        sendDigestEmail({
          recipient: { email: recipient.email, name: recipient.name },
          pendingTasks: pendingTasks.map((t) => ({
            id: t.id,
            subject: t.subject,
            dueAt: t.dueAt,
            doerName: t.doerName,
            isOverdue: t.isOverdue,
            daysOverdue: t.daysOverdue,
          })),
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        }),
        SEND_TIMEOUT_MS,
        "sendDigestEmail",
      );
      if (result.error) {
        console.error(`[cron/digest] sendDigestEmail error for ${recipient.email}:`, result.error);
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[cron/digest] sendDigestEmail threw for ${recipient.email}`, err);
    }

    // 3) Slack + WhatsApp.
    const channelPrefs = await getRecipientChannelPrefs(recipient.id).catch((err) => {
      console.error(`[cron/digest] getRecipientChannelPrefs failed for ${recipient.email}`, err);
      return null;
    });
    if (channelPrefs) {
      try {
        await withTimeout(
          sendSlackDigest(
            channelPrefs,
            pendingTasks.map((t) => ({
              subject: t.subject,
              shortId: t.shortId ?? "",
              daysOverdue: t.daysOverdue,
            })),
          ),
          SEND_TIMEOUT_MS,
          "sendSlackDigest",
        );
      } catch (err) {
        console.error(`[cron/digest] sendSlackDigest threw for ${recipient.email}`, err);
      }
      try {
        await withTimeout(
          sendWhatsAppDigest(
            channelPrefs,
            pendingTasks.map((t) => ({ subject: t.subject, daysOverdue: t.daysOverdue })),
          ),
          SEND_TIMEOUT_MS,
          "sendWhatsAppDigest",
        );
      } catch (err) {
        console.error(`[cron/digest] sendWhatsAppDigest threw for ${recipient.email}`, err);
      }
    }
  }

  return NextResponse.json<DigestResult>({ ok: true, processed, sent, skipped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return runDigest(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return runDigest(request);
}
