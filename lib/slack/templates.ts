import type { NotificationKind } from "@/db/schema";

/**
 * M4 Commit 3a — Slack Block-Kit template builder.
 *
 * Each `NotificationKind` becomes three blocks:
 *   1. `context`   — emoji + a short verb headline ("Apeksha assigned you …").
 *   2. `section`   — the task subject in bold, optional body underneath.
 *   3. `actions`   — a single primary "View task →" button that deep-links
 *                    to `${SITE}/t/<shortId>` (handled by the
 *                    short-link redirector route).
 *
 * The output is intentionally typed as `unknown[]` at the callsite — the
 * Slack SDK accepts any Block-Kit shape and we don't want to drag the
 * full `KnownBlock` union through the dispatcher.
 */

const EMOJI: Record<NotificationKind, string> = {
  task_assigned: ":bell:",
  task_initiated: ":memo:",
  status_changed: ":arrows_counterclockwise:",
  approved: ":white_check_mark:",
  declined: ":x:",
  reassigned: ":twisted_rightwards_arrows:",
  transferred: ":outbox_tray:",
  cancelled: ":wastebasket:",
  commented: ":speech_balloon:",
  overdue_digest: ":warning:",
  // Weekly Goals kinds are delivered by their own cron (email + in-app only),
  // never through the Slack dispatcher — these entries satisfy the exhaustive
  // map but aren't sent.
  weekly_goals_assigned: ":dart:",
  weekly_goals_fill_reminder: ":bar_chart:",
  weekly_goals_incomplete: ":warning:",
  // Attendance Phase A — inbox-only kinds.
  attendance_late: ":hourglass:",
  attendance_late_waived: ":white_check_mark:",
  attendance_half_day: ":clock5:",
  attendance_device: ":iphone:",
  attendance_late_deduction: ":heavy_minus_sign:",
};

const VERB: Record<NotificationKind, (actor: string, statusLabel?: string) => string> = {
  task_assigned: (a) => `${a} assigned you a task`,
  task_initiated: (a) => `${a} initiated your task`,
  // M5.1 — when the admin-resolved status label is available, surface it
  // in the headline so the rename ("Need Help" → "Stuck") flows through.
  status_changed: (a, label) =>
    label ? `${a} moved your task to *${label}*` : `${a} moved your task`,
  approved: (a) => `${a} approved your task`,
  declined: (a) => `${a} declined your task`,
  reassigned: (a) => `${a} reassigned a task`,
  transferred: (a) => `${a} transferred a task`,
  cancelled: (a) => `${a} cancelled a task`,
  commented: (a) => `${a} commented on your task`,
  overdue_digest: () => `You have overdue tasks`,
  weekly_goals_assigned: () => `Your priorities for the week`,
  weekly_goals_fill_reminder: () => `Update your % done`,
  weekly_goals_incomplete: () => `You have unmarked weekly goals`,
  // Attendance Phase A — inbox-only kinds.
  attendance_late: () => `Late check-in recorded`,
  attendance_late_waived: () => `Late check-in waived`,
  attendance_half_day: () => `Half day recorded`,
  attendance_device: () => `New device used for attendance`,
  attendance_late_deduction: () => `Late deduction applied`,
};

export interface SlackCtx {
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  // M5.1 — optional admin-resolved status label (only meaningful for
  // status_changed today). Builders ignore it for other kinds.
  statusLabel?: string;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://altus-corp-dashboard.vercel.app";

export function buildSlackBlocks(
  kind: NotificationKind,
  ctx: SlackCtx,
): unknown[] {
  const url = `${SITE}/t/${ctx.shortId}`;
  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${EMOJI[kind]} *${VERB[kind](ctx.actorName, ctx.statusLabel)}*`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${ctx.taskSubject}*${ctx.body ? `\n${ctx.body}` : ""}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View task →" },
          url,
          style: "primary",
        },
      ],
    },
  ];
}
