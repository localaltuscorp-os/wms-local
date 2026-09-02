/**
 * Kill-switches for the scheduled REPORTING layer (Sir's ruleset, 2026-07-17).
 *
 * ALL DEFAULT OFF — every cron self-gates on its flag and returns a no-op summary
 * unless the `*_ON` env var is exactly `'true'`. This keeps the reporting build
 * completely inert (no emails, no freezes) until Hetesh flips each flag on Vercel
 * AFTER browser-verifying — the showcase / live app is never touched by an unset
 * flag. Read straight off process.env — no I/O, safe to import anywhere.
 */

/**
 * NOTE: the Sunday weekly attendance report is now LIVE (no flag) — its cron
 * `app/api/cron/attendance-weekly` runs unconditionally behind Bearer CRON_SECRET.
 */

/** Monthly attendance statement emailed on the 1st. OFF. */
export function monthlyAttendanceStatementOn(): boolean {
  return process.env.MONTHLY_ATTENDANCE_STATEMENT_ON === "true";
}

/** Freeze a month's attendance on the 2nd (blocks edits after). OFF. */
export function attendanceFreezeOn(): boolean {
  return process.env.ATTENDANCE_FREEZE_ON === "true";
}

/** 12th-of-month email: salary + incentive + attendance slips. OFF. */
export function monthlySlipsEmailOn(): boolean {
  return process.env.MONTHLY_SLIPS_EMAIL_ON === "true";
}

/** Daily HR nudge when a probation / free-training period is ending (#38/#39). OFF. */
export function hrConfirmationReminderOn(): boolean {
  return process.env.HR_CONFIRMATION_REMINDER_ON === "true";
}
