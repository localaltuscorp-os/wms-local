/**
 * KPI Management notifications — ON by default. Whenever anyone creates or
 * changes an employee's KPI, that employee is emailed (subject to Resend being
 * configured). A single explicit off-switch remains for emergencies: set
 * `KPI_NOTIFICATIONS_ON=false` to silence the live email send (history rows +
 * in-app notifications still record).
 */
export function kpiNotificationsOn(): boolean {
  return process.env.KPI_NOTIFICATIONS_ON !== "false";
}

/** The env var name, surfaced for logs / admin copy. */
export const KPI_NOTIFICATIONS_FLAG = "KPI_NOTIFICATIONS_ON";
