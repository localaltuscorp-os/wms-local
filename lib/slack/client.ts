import "server-only";
import { WebClient } from "@slack/web-api";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";

/**
 * M4 Commit 3a — Slack web client wrapper.
 *
 * The Slack `WebClient` is lazily constructed on first use and cached on
 * `globalThis` so successive calls (and HMR reloads in dev) reuse the same
 * underlying HTTP agent.  When `SLACK_BOT_TOKEN` is missing we return
 * `null` from every accessor — the dispatcher treats that as `"skip"`.
 *
 * `resolveSlackUserId` is the workhorse: the first time we send a DM to
 * an employee we don't yet have a Slack uid for, we call
 * `users.lookupByEmail` and persist the result to `employees.slack_user_id`
 * so subsequent sends are zero-API.  Errors (network, rate limit, missing
 * scope, etc.) collapse to `null` because the channel is best-effort.
 */

const globalForSlack = globalThis as unknown as { __slack?: WebClient };

function getSlack(): WebClient | null {
  if (!process.env.SLACK_BOT_TOKEN) return null;
  if (!globalForSlack.__slack) {
    globalForSlack.__slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return globalForSlack.__slack;
}

export async function resolveSlackUserId(
  employee: Pick<Employee, "id" | "email" | "slackUserId">,
): Promise<string | null> {
  if (employee.slackUserId) return employee.slackUserId;
  const slack = getSlack();
  if (!slack) return null;
  try {
    const r = await slack.users.lookupByEmail({ email: employee.email });
    if (!r.ok || !r.user?.id) return null;
    await db
      .update(employees)
      .set({ slackUserId: r.user.id })
      .where(eq(employees.id, employee.id));
    return r.user.id;
  } catch {
    return null;
  }
}

export async function postSlackMessage(
  channel: string,
  blocks: unknown[],
): Promise<"sent" | "skip"> {
  const slack = getSlack();
  if (!slack) return "skip";
  try {
    const r = await slack.chat.postMessage({
      channel,
      blocks: blocks as never,
      text: "",
    });
    return r.ok ? "sent" : "skip";
  } catch {
    return "skip";
  }
}
