import "server-only";

/**
 * WS-5 ↔ WS-7 shared contract for the Monday attendance-confirmation flow.
 *
 * WS-7 (this slice) issues the approval token + sends the email/WhatsApp link.
 * WS-5 (sibling agent) owns the confirm queue UI + the actual "mark this
 * person's outside-office attendance as confirmed" mutation. Both sides MUST
 * agree on the `approval_tokens.targetId` shape — that agreement lives here so
 * neither side re-invents it.
 *
 *   kind      = ATTENDANCE_CONFIRM_KIND ("attendance_confirm")
 *   action    = "approve"  (a future "reject" link can reuse the same kind)
 *   targetId  = "<confirmerId>|<weekStartIso>"
 *               - confirmerId : employees.id of the manager/accountant who is
 *                               confirming (the recipient of the reminder)
 *               - weekStartIso: YYYY-MM-DD of the Monday whose week is being
 *                               confirmed (IST)
 *
 * A single token authorises the confirmer to bulk-confirm their whole pending
 * set for that week. When WS-5 wants per-person tokens instead, extend the
 * targetId with a third `|<subjectId>` segment and bump the parser.
 */

export const ATTENDANCE_CONFIRM_KIND = "attendance_confirm";
export const ATTENDANCE_CONFIRM_ACTION = "approve";

export interface AttendanceConfirmTarget {
  confirmerId: string;
  weekStartIso: string;
}

/** Build the canonical `targetId` for an attendance-confirm token. */
export function attendanceConfirmTargetId(t: AttendanceConfirmTarget): string {
  return `${t.confirmerId}|${t.weekStartIso}`;
}

/** Parse a `targetId` back into its parts; null if it isn't this shape. */
export function parseAttendanceConfirmTargetId(
  targetId: string,
): AttendanceConfirmTarget | null {
  const [confirmerId, weekStartIso, ...rest] = targetId.split("|");
  if (!confirmerId || !weekStartIso || rest.length > 0) return null;
  return { confirmerId, weekStartIso };
}

/** Monday (IST) of the week containing `now`, as YYYY-MM-DD. */
export function istWeekStartIso(now: Date = new Date()): string {
  // Shift to IST wall clock (UTC + 5:30), then find that day's Monday.
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const dow = ist.getUTCDay(); // 0=Sun … 1=Mon
  const deltaToMonday = (dow + 6) % 7; // days since Monday
  const monday = new Date(ist.getTime() - deltaToMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}
