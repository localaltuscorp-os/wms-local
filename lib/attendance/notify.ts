import "server-only";
import { notify } from "@/lib/notifications/dispatch";
import type { NotificationKind } from "@/db/schema";
import { decideCheckoutNotification } from "./status";

export { decideCheckoutNotification };

/**
 * Attendance Phase A, Task A8 — best-effort attendance notifications.
 *
 * Three kinds are emailed (+ inbox): a late check-in, a late/left-early day
 * that a full day later WAIVED, and a half-day. We force the channel set to
 * `["email"]` so dispatch creates the in-app row AND sends the email, but
 * never fires Slack/WhatsApp/push (there's no WhatsApp template for these and
 * the org doesn't want attendance noise on the chat channels).
 */

export type AttendanceNotifyKind =
  | "attendance_late"
  | "attendance_late_waived"
  | "attendance_half_day"
  | "attendance_late_deduction";

export interface AttendanceNotifyInfo {
  /** YYYY-MM-DD in the employee's timezone. */
  logDate: string;
  /** "HH:mm" check-in, when known. */
  inAt?: string | null;
  /** "HH:mm" check-out, when known. */
  outAt?: string | null;
  /** Minutes worked, when known (out-punch flows). */
  workedMinutes?: number | null;
  /** Un-waived late count for the month (B8 deduction alert). */
  lateCount?: number | null;
  /** Friendly month label, e.g. "June 2026" (B8 deduction alert). */
  monthLabel?: string | null;
}

/** Pretty "h:mm" from minutes, or "—". */
function hoursLabel(mins: number | null | undefined): string {
  if (mins == null || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const TITLES: Record<AttendanceNotifyKind, string> = {
  attendance_late: "You checked in late",
  attendance_late_waived: "Late arrival waived — full day logged",
  attendance_half_day: "Half-day recorded",
  attendance_late_deduction: "Half-day salary deduction — 3 lates this month",
};

/** Build the JSON body the email templates parse (date / in / out / hours and
 *  the B8 deduction fields). */
export function attendanceMetaBody(info: AttendanceNotifyInfo): string {
  return JSON.stringify({
    logDate: info.logDate,
    inAt: info.inAt ?? null,
    outAt: info.outAt ?? null,
    workedMinutes: info.workedMinutes ?? null,
    hoursLabel: hoursLabel(info.workedMinutes),
    lateCount: info.lateCount ?? null,
    monthLabel: info.monthLabel ?? null,
  });
}

/**
 * Fire one attendance notification — email + in-app inbox only. Wrapped in the
 * dispatcher's own best-effort `notify()` (it never throws), but we still guard
 * here so a synchronous mistake can't bubble into the punch action.
 */
export async function notifyAttendance(
  kind: AttendanceNotifyKind,
  employee: { id: string },
  info: AttendanceNotifyInfo,
): Promise<void> {
  try {
    await notify({
      userId: employee.id,
      kind: kind as NotificationKind,
      title: TITLES[kind],
      body: attendanceMetaBody(info),
      forceChannels: ["email"], // email + in-app row; no slack/whatsapp/push
    });
  } catch (err) {
    console.warn("[attendance] notifyAttendance failed (non-fatal)", err);
  }
}
