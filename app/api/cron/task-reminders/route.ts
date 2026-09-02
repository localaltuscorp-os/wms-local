import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskReminderRules } from "@/db/schema";
import { sendTaskReminderEmail } from "@/lib/email/resend";
import {
  collectReminderTasks,
  countReminderTasks,
  resolveReminderRecipients,
} from "@/lib/task-reminders/collect";
import { istDateKey, isRuleDue } from "@/lib/task-reminders/rules";

/**
 * Task Reminder dispatcher.
 *
 * A GITHUB ACTIONS cron hits this every 15 minutes — see
 * .github/workflows/task-management-task-reminders.yml, NOT vercel.json. The
 * Vercel Hobby plan caps native crons at one run per day, and a sub-daily entry
 * doesn't get throttled: it invalidates the whole vercel.json so Vercel refuses
 * to create any deployment at all. The repo already drives
 * /api/cron/retry-dispatch the same way for the same reason.
 *
 * Each tick loads the ENABLED rules and fires the ones that have come due today
 * — "due" meaning the IST wall clock has passed the rule's own `send_time_ist`
 * and `last_sent_on` is not already today (see lib/task-reminders/rules.ts).
 *
 * Why a polling dispatcher rather than one cron entry per rule: rules are
 * created and retimed from the Admin UI, and the schedule is a committed file
 * either way. A per-rule cron would mean a commit every time an admin changed a
 * send time. The cost is that a rule fires within 15 minutes of its configured
 * time rather than to the minute — worth stating in the UI, which it is.
 *
 * For each due rule: collect matching incomplete tasks grouped by employee,
 * then send ONE consolidated email PER RECIPIENT. `last_sent_on` is stamped
 * whether or not there was anything to send, so a rule fires at most once a
 * day; a rule with nothing to report sends nothing at all rather than a daily
 * "all clear", which is noise.
 *
 * One rule failing never stops the others — each is wrapped, and the failure is
 * recorded on the rule's own `last_error` so the Admin UI can show it.
 *
 * Authentication: `Authorization: Bearer <CRON_SECRET>`, as every other cron in
 * this app. Both GET (Vercel's default) and POST (testability) are accepted.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A hung SMTP call must not starve the function timeout. */
const SEND_TIMEOUT_MS = 10_000;

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

interface RuleOutcome {
  ruleId: string;
  name: string;
  recipients: number;
  employees: number;
  tasks: number;
  sent: number;
  error?: string;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = istDateKey(now);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const rules = await db
    .select()
    .from(taskReminderRules)
    .where(eq(taskReminderRules.isEnabled, true))
    .orderBy(asc(taskReminderRules.sendTimeIst));

  const due = rules.filter((r) => isRuleDue(r, now));
  const outcomes: RuleOutcome[] = [];

  for (const rule of due) {
    const outcome: RuleOutcome = {
      ruleId: rule.id,
      name: rule.name,
      recipients: 0,
      employees: 0,
      tasks: 0,
      sent: 0,
    };

    try {
      const [groups, recipients] = await Promise.all([
        collectReminderTasks(rule, now),
        resolveReminderRecipients(rule.recipientIds ?? []),
      ]);
      const total = countReminderTasks(groups);
      outcome.employees = groups.length;
      outcome.tasks = total;
      outcome.recipients = recipients.length;

      // Nothing to chase → send nothing. A daily "all clear" trains people to
      // ignore the sender. The rule is still stamped below so it doesn't
      // re-evaluate every 15 minutes for the rest of the day.
      if (total > 0) {
        for (const recipient of recipients) {
          try {
            const res = await withTimeout(
              sendTaskReminderEmail({
                recipient: { email: recipient.email, name: recipient.name },
                ruleName: rule.name,
                groups,
                totalTasks: total,
                siteUrl,
              }),
              SEND_TIMEOUT_MS,
              "sendTaskReminderEmail",
            );
            if (res.error) {
              console.error(
                `[cron/task-reminders] send failed for ${recipient.email} on "${rule.name}":`,
                res.error,
              );
            } else {
              outcome.sent++;
            }
          } catch (err) {
            // One bad recipient must not cost the rest of the list their mail.
            console.error(
              `[cron/task-reminders] send threw for ${recipient.email} on "${rule.name}"`,
              err,
            );
          }
        }
      }

      await db
        .update(taskReminderRules)
        .set({ lastSentOn: today, lastRunAt: now, lastError: null, updatedAt: now })
        .where(eq(taskReminderRules.id, rule.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome.error = message;
      console.error(`[cron/task-reminders] rule "${rule.name}" failed`, err);
      // Record the failure but do NOT stamp `last_sent_on`: the next tick
      // should retry today rather than write the day off.
      await db
        .update(taskReminderRules)
        .set({ lastRunAt: now, lastError: message, updatedAt: now })
        .where(eq(taskReminderRules.id, rule.id))
        .catch(() => {});
    }

    outcomes.push(outcome);
  }

  return NextResponse.json({
    ok: true,
    istDate: today,
    enabled: rules.length,
    due: due.length,
    outcomes,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
