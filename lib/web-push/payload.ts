import type { NotificationKind } from "@/db/schema";

/**
 * M4 Commit 3c — Web Push payload builder.
 *
 * Mirrors the "actor + verb + subject" pattern used by the email / slack
 * / whatsapp arms so the four channels stay editorially consistent.  The
 * payload here is what the server stringifies and hands to
 * `webpush.sendNotification`; the Service Worker (public/sw.js) re-parses
 * it and feeds the fields to `showNotification`.
 *
 * Keep the JSON under 4KB — that's the practical web-push payload ceiling
 * for FCM/APNS gateways.  We don't currently approach it but the test
 * guards against future regressions.
 */

const TITLES: Record<NotificationKind, (actor: string) => string> = {
  task_assigned: (a) => `${a} assigned you a task`,
  task_initiated: (a) => `${a} initiated your task`,
  status_changed: (a) => `${a} updated a task`,
  approved: (a) => `${a} approved your task`,
  declined: (a) => `${a} declined your task`,
  reassigned: (a) => `${a} reassigned a task`,
  transferred: (a) => `${a} transferred a task`,
  cancelled: (a) => `${a} cancelled a task`,
  commented: (a) => `${a} commented on your task`,
  overdue_digest: () => `You have overdue tasks`,
  // Weekly Goals — delivered by their own cron (email + in-app), not via push.
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

export interface PushCtx {
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  taskId: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: NotificationKind;
}

export function buildPushPayload(
  kind: NotificationKind,
  ctx: PushCtx,
): PushPayload {
  return {
    title: TITLES[kind](ctx.actorName),
    body: ctx.body ? `${ctx.taskSubject} — ${ctx.body}` : ctx.taskSubject,
    url: `/tasks/${ctx.taskId}`,
    tag: `task:${ctx.taskId}`,
    kind,
  };
}
