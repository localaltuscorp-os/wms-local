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
  nudged: ":zap:",
  overdue_digest: ":warning:",
  // Weekly Goals — delivered by their own cron; present to satisfy the
  // exhaustive map but not sent via Slack.
  weekly_goals_assigned: ":dart:",
  weekly_goals_fill_reminder: ":bar_chart:",
  weekly_goals_incomplete: ":warning:",
  // Attendance Phase A — inbox-only kinds.
  attendance_late: ":hourglass:",
  attendance_late_waived: ":white_check_mark:",
  attendance_half_day: ":clock5:",
  attendance_device: ":iphone:",
  attendance_late_deduction: ":heavy_minus_sign:",
  training_test_failed: ":x:",
  dcc_fill_reminder: ":alarm_clock:",
  ambassador_reminder: ":gem:",
  // Goals Cascade — delivered by their own cron / in-app inbox; present to
  // satisfy the exhaustive map but not sent via Slack.
  goals_commit_reminder: ":dart:",
  goals_approval_reminder: ":memo:",
  goals_committed: ":lock:",
  goals_approved: ":white_check_mark:",
  hr_confirmation_due: ":memo:",
  // HR Support (mig 0145) — generic copy by design (confidential grievances
  // must never leak a subject line into a channel).
  hr_ticket_created: ":ticket:",
  hr_ticket_assigned: ":inbox_tray:",
  hr_ticket_replied: ":speech_balloon:",
  hr_ticket_status_changed: ":arrows_counterclockwise:",
  hr_ticket_sla_breach: ":rotating_light:",
  hr_ticket_csat_request: ":star:",
  // Appraisal (mig 0146) — IN-APP ONLY by design; present to satisfy the
  // exhaustive map but not sent via Slack.
  appraisal_cycle_opened: ":clipboard:",
  appraisal_self_reminder: ":pencil2:",
  appraisal_manager_pending: ":memo:",
  appraisal_management_pending: ":memo:",
  appraisal_finalized: ":trophy:",
  // Enterprise Communications (mig 0179) — delivered in-app + email by the
  // ECOS publish flow, never via Slack; placeholder to satisfy the exhaustive map.
  broadcast: ":mega:",
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
  nudged: (a) => `${a} nudged you on a task`,
  overdue_digest: () => `You have overdue tasks`,
  // Weekly Goals — delivered by their own cron; not sent via Slack.
  weekly_goals_assigned: () => `Your priorities for the week`,
  weekly_goals_fill_reminder: () => `Update your % done`,
  weekly_goals_incomplete: () => `You have unmarked weekly goals`,
  // Attendance Phase A — inbox-only kinds.
  attendance_late: () => `Late check-in recorded`,
  attendance_late_waived: () => `Late check-in waived`,
  attendance_half_day: () => `Half day recorded`,
  attendance_device: () => `New device used for attendance`,
  attendance_late_deduction: () => `Late deduction applied`,
  training_test_failed: () => `Training test not passed`,
  dcc_fill_reminder: () => `Fill today's DCC KPIs`,
  ambassador_reminder: () => `You have an ambassador to follow up`,
  // Goals Cascade — delivered by their own cron / in-app inbox; not sent via Slack.
  goals_commit_reminder: () => `Commit your week's goals`,
  goals_approval_reminder: () => `Approve your team's goals`,
  goals_committed: () => `Weekly goals committed`,
  goals_approved: () => `Your weekly goals were approved`,
  hr_confirmation_due: () => `Issue a confirmation letter`,
  // HR Support (mig 0145) — generic copy (no subject leak for grievances).
  hr_ticket_created: () => `A new HR ticket was raised`,
  hr_ticket_assigned: () => `An HR ticket was assigned to you`,
  hr_ticket_replied: () => `New reply on your HR ticket`,
  hr_ticket_status_changed: () => `Your HR ticket was updated`,
  hr_ticket_sla_breach: () => `An HR ticket breached its SLA`,
  hr_ticket_csat_request: () => `How did we do? Rate your HR ticket`,
  // Appraisal (mig 0146) — in-app only; placeholders for the exhaustive map.
  appraisal_cycle_opened: () => `Your appraisal is open`,
  appraisal_self_reminder: () => `Complete your self scores`,
  appraisal_manager_pending: () => `Appraisal scores await your review`,
  appraisal_management_pending: () => `Appraisal scores await management review`,
  appraisal_finalized: () => `Your appraisal is finalized`,
  // Enterprise Communications (mig 0179) — not sent via Slack; placeholder.
  broadcast: () => `New company communication`,
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
