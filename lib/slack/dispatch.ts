import "server-only";
import { resolveSlackUserId, postSlackMessage } from "@/lib/slack/client";
import { buildSlackBlocks } from "@/lib/slack/templates";
import type { NotificationKind } from "@/db/schema";
import type { RecipientChannelPrefs } from "@/lib/notifications/channel-prefs";

/**
 * M4 Commit 3a — real Slack DM sender, replacing the Commit 2 stub.
 *
 * Contract (mirrors the dispatcher's `ChannelOutcome`):
 *   - `"sent"` — Slack acknowledged a `chat.postMessage` for the resolved uid.
 *   - `"skip"` — recipient opted out, no `slackUserId` resolvable, or env
 *                missing. The caller stamps no row on `delivered_channels`.
 *
 * Errors thrown from the underlying Slack web client are swallowed inside
 * `lib/slack/client.ts` (each call collapses to `"skip"`), so this
 * function itself never throws.
 */

export interface SlackDispatchCtx {
  kind: NotificationKind;
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  // M5.1 — admin-resolved status label, forwarded to buildSlackBlocks for
  // status_changed verb interpolation. Other kinds ignore it today.
  statusLabel?: string;
}

export async function sendSlackDM(
  recipient: RecipientChannelPrefs,
  ctx: SlackDispatchCtx,
): Promise<"sent" | "skip"> {
  if (!recipient.slackOptIn) return "skip";
  const uid = await resolveSlackUserId({
    id: recipient.id,
    email: recipient.email,
    slackUserId: recipient.slackUserId,
  });
  if (!uid) return "skip";
  return postSlackMessage(uid, buildSlackBlocks(ctx.kind, ctx));
}

/**
 * Daily-digest variant.  Renders a Slack block list of overdue tasks
 * with deep links to the short-link redirector and posts it to the
 * recipient's DM channel.  Used by `app/api/cron/digest/route.ts`.
 */
export async function sendSlackDigest(
  recipient: RecipientChannelPrefs,
  overdueTasks: { subject: string; shortId: string; daysOverdue: number }[],
): Promise<"sent" | "skip"> {
  if (!recipient.slackOptIn) return "skip";
  const uid = await resolveSlackUserId({
    id: recipient.id,
    email: recipient.email,
    slackUserId: recipient.slackUserId,
  });
  if (!uid) return "skip";
  const SITE =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://altus-corp-dashboard.vercel.app";
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `:warning: You have ${overdueTasks.length} overdue task${
          overdueTasks.length === 1 ? "" : "s"
        }`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: overdueTasks
          .slice(0, 10)
          .map(
            (t) =>
              `• <${SITE}/t/${t.shortId}|${t.subject}> — ${t.daysOverdue}d overdue`,
          )
          .join("\n"),
      },
    },
  ];
  return postSlackMessage(uid, blocks);
}
