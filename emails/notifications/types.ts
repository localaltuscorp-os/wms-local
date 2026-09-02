/**
 * Shared types for M2.3 notification templates.
 *
 * The notification kinds are owned by `db/schema.ts` (Agent A's
 * `NOTIFICATION_KINDS` array) — we re-export the union here so template
 * files don't have to import from `@/db/schema` directly.
 */
export type { NotificationKind } from "@/db/schema";

/**
 * Optional structured payload carried in `notification.body` as JSON.
 *
 * The dispatcher (`lib/notifications/dispatch.ts`) is free to stuff
 * task-specific context here so the email layer can render priority
 * chips, status chips, comment quotes, etc. without round-tripping to
 * the DB.  Every field is optional and defensively parsed — a plain
 * non-JSON string body is treated as `{ note: <body> }`.
 */
export type NotificationMeta = {
  /** For status_changed — the new status enum value. */
  toStatus?: string;
  /** For status_changed — the previous status enum value. */
  fromStatus?: string;
  /** For task_assigned — task priority enum. */
  priority?: string;
  /** For task_assigned — formatted due date. */
  dueAt?: string;
  /** For task_assigned — initiator display name. */
  initiatorName?: string;
  /** For reassigned — true if recipient is the new doer, false if they're being moved off. */
  isIncoming?: boolean;
  /** For reassigned — name of the other party (counterpart). */
  counterpartName?: string;
  /** For transferred — external destination string. */
  externalTo?: string;
  /** Free-text note shared across declined/cancelled/transferred. */
  note?: string;
  /** For commented — the comment body. */
  comment?: string;
  /** Attendance (Task A8) — YYYY-MM-DD of the affected log day. */
  logDate?: string;
  /** Attendance — "HH:mm" check-in time. */
  inAt?: string | null;
  /** Attendance — "HH:mm" check-out time. */
  outAt?: string | null;
  /** Attendance — pretty "Hh MMm" worked-hours label. */
  hoursLabel?: string;
  /** Attendance — raw worked minutes. */
  workedMinutes?: number | null;
  /** Attendance (B8) — un-waived late count for the month (deduction alert). */
  lateCount?: number | null;
  /** Attendance (B8) — friendly month label, e.g. "June 2026". */
  monthLabel?: string | null;
};

/**
 * Per-row payload for the daily-digest email — mirrored from
 * `OverdueTask` in `lib/queries/overdue.ts`.
 */
export interface OverdueDigestTask {
  id: string;
  subject: string;
  dueAt: Date;
  doerId: string;
  doerName: string;
  daysOverdue: number;
}

/** Per-row payload for the daily PENDING digest. */
export interface PendingDigestTask {
  id: string;
  subject: string;
  dueAt: Date | null;
  doerName: string;
  isOverdue: boolean;
  daysOverdue: number;
}

/**
 * Arguments to `sendDigestEmail`.  Mirrors the stub Agent A landed in
 * `lib/email/resend.ts` — the cron route owns this contract.
 */
export interface SendDigestEmailArgs {
  recipient: { email: string; name: string };
  pendingTasks: PendingDigestTask[];
  /** Origin for CTA links; may be undefined (falls back to relative URLs). */
  siteUrl: string | undefined;
}
