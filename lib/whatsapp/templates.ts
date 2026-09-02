import type { NotificationKind } from "@/db/schema";

/**
 * Maps a `NotificationKind` to the Meta Cloud API utility-template name
 * we registered for it. All templates live under the `vp_*` namespace
 * so they're easy to filter inside Meta's Business Manager.
 */
const NAMES: Record<NotificationKind, string> = {
  task_assigned: "vp_assigned",
  task_initiated: "vp_initiated",
  status_changed: "vp_status_changed",
  approved: "vp_approved",
  declined: "vp_declined",
  reassigned: "vp_reassigned",
  transferred: "vp_transferred",
  cancelled: "vp_cancelled",
  commented: "vp_commented",
  nudged: "vp_nudged",
  overdue_digest: "vp_overdue_digest",
  // Weekly Goals — delivered by their own cron, never via the WhatsApp
  // dispatcher. Names are placeholders to satisfy the exhaustive map.
  weekly_goals_assigned: "vp_weekly_goals_assigned",
  weekly_goals_fill_reminder: "vp_weekly_goals_fill",
  weekly_goals_incomplete: "vp_weekly_goals_incomplete",
  // Attendance Phase A — inbox-only kinds; no registered WhatsApp template.
  attendance_late: "vp_attendance_late",
  attendance_late_waived: "vp_attendance_late_waived",
  attendance_half_day: "vp_attendance_half_day",
  attendance_device: "vp_attendance_device",
  attendance_late_deduction: "vp_attendance_late_deduction",
  training_test_failed: "vp_training_test_failed",
  dcc_fill_reminder: "vp_dcc_fill_reminder",
  ambassador_reminder: "vp_ambassador_reminder",
  // Goals Cascade — the weekly report media send uses its OWN document template
  // (WA_GOALS_TEMPLATE, see lib/whatsapp/media.ts); these matrix names are
  // placeholders to satisfy the exhaustive map (not sent via the text dispatcher).
  goals_commit_reminder: "vp_goals_commit_reminder",
  goals_approval_reminder: "vp_goals_approval_reminder",
  goals_committed: "vp_goals_committed",
  goals_approved: "vp_goals_approved",
  hr_confirmation_due: "vp_hr_confirmation",
  // HR Support (mig 0145) — no registered WhatsApp templates; names are
  // placeholders to satisfy the exhaustive map (routed away from WhatsApp in
  // the notification matrix).
  hr_ticket_created: "vp_hr_ticket_created",
  hr_ticket_assigned: "vp_hr_ticket_assigned",
  hr_ticket_replied: "vp_hr_ticket_replied",
  hr_ticket_status_changed: "vp_hr_ticket_status",
  hr_ticket_sla_breach: "vp_hr_ticket_sla",
  hr_ticket_csat_request: "vp_hr_ticket_csat",
  // Appraisal (mig 0146) — IN-APP ONLY; placeholders for the exhaustive map.
  appraisal_cycle_opened: "vp_appraisal_opened",
  appraisal_self_reminder: "vp_appraisal_self",
  appraisal_manager_pending: "vp_appraisal_manager",
  appraisal_management_pending: "vp_appraisal_management",
  appraisal_finalized: "vp_appraisal_finalized",
  // Enterprise Communications (mig 0179) — no registered WhatsApp template;
  // placeholder to satisfy the exhaustive map (routed away from WhatsApp).
  broadcast: "vp_broadcast",
};

export function templateNameForKind(kind: NotificationKind): string {
  return NAMES[kind];
}

export interface TemplateCtx {
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  digestCount?: number;
  digestPreview?: string;
  // M5.1 — admin-resolved status label. status_changed uses this as the
  // body parameter so renamed statuses propagate. Other kinds ignore it.
  statusLabel?: string;
}

type Param = { type: "text"; text: string };

function t(s: string): Param {
  return { type: "text", text: s };
}

/**
 * Per-kind positional parameter builders, matching the registered Meta
 * templates' body variable counts from spec section 4. Templates that
 * don't need a `body` field (e.g. vp_assigned only needs the due date
 * which arrives via `ctx.body`) still expect a non-empty string for
 * every positional slot, so we default missing fields to "".
 */
const VARS: Record<NotificationKind, (ctx: TemplateCtx) => Param[]> = {
  task_assigned: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  task_initiated: (c) => [t(c.actorName), t(c.taskSubject), t(c.shortId)],
  status_changed: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    // M5.1 — prefer the resolved status label over the raw JSON meta in
    // c.body. Pre-M5.1 callers passed JSON here, which surfaced as
    // "{\"toStatus\":\"done\"}" inside the WhatsApp message.
    t(c.statusLabel ?? c.body ?? ""),
    t(c.shortId),
  ],
  approved: (c) => [t(c.actorName), t(c.taskSubject), t(c.shortId)],
  declined: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  reassigned: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  transferred: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  cancelled: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  commented: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  nudged: (c) => [t(c.actorName), t(c.taskSubject), t(c.shortId)],
  overdue_digest: (c) => [
    t(String(c.digestCount ?? 0)),
    t(c.digestPreview ?? ""),
  ],
  // Weekly Goals — delivered by their own cron; placeholder single-body
  // builders to satisfy the exhaustive map.
  weekly_goals_assigned: (c) => [t(String(c.digestCount ?? 0))],
  weekly_goals_fill_reminder: (c) => [t(String(c.digestCount ?? 0))],
  weekly_goals_incomplete: (c) => [t(String(c.digestCount ?? 0))],
  // Attendance Phase A — inbox-only kinds; simple single-body fallback.
  attendance_late: (c) => [t(c.body ?? "")],
  attendance_late_waived: (c) => [t(c.body ?? "")],
  attendance_half_day: (c) => [t(c.body ?? "")],
  attendance_device: (c) => [t(c.body ?? "")],
  attendance_late_deduction: (c) => [t(c.body ?? "")],
  training_test_failed: (c) => [t(c.body ?? "")],
  dcc_fill_reminder: (c) => [t(c.body ?? "")],
  ambassador_reminder: (c) => [t(c.body ?? "")],
  // Goals Cascade — placeholder single-body builders to satisfy the exhaustive map.
  goals_commit_reminder: (c) => [t(c.body ?? "")],
  goals_approval_reminder: (c) => [t(c.body ?? "")],
  goals_committed: (c) => [t(c.body ?? "")],
  goals_approved: (c) => [t(c.body ?? "")],
  hr_confirmation_due: (c) => [t(c.body ?? "")],
  // HR Support — placeholder single-body builders (not sent via WhatsApp).
  hr_ticket_created: (c) => [t(c.body ?? "")],
  hr_ticket_assigned: (c) => [t(c.body ?? "")],
  hr_ticket_replied: (c) => [t(c.body ?? "")],
  hr_ticket_status_changed: (c) => [t(c.body ?? "")],
  hr_ticket_sla_breach: (c) => [t(c.body ?? "")],
  hr_ticket_csat_request: (c) => [t(c.body ?? "")],
  // Appraisal — placeholder single-body builders (in-app only).
  appraisal_cycle_opened: (c) => [t(c.body ?? "")],
  appraisal_self_reminder: (c) => [t(c.body ?? "")],
  appraisal_manager_pending: (c) => [t(c.body ?? "")],
  appraisal_management_pending: (c) => [t(c.body ?? "")],
  appraisal_finalized: (c) => [t(c.body ?? "")],
  // Enterprise Communications (mig 0179) — placeholder single-body builder.
  broadcast: (c) => [t(c.body ?? "")],
};

/**
 * Returns the `components` payload that Meta Cloud API expects in
 * `template.components`. We only ever build a single `body` component;
 * header/footer/button components stay registered with default values
 * on the template itself.
 */
export function buildTemplateComponents(
  kind: NotificationKind,
  ctx: TemplateCtx,
): Array<{ type: "body"; parameters: Param[] }> {
  return [{ type: "body", parameters: VARS[kind](ctx) }];
}
