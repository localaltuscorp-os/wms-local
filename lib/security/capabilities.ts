/**
 * THE SECURITY CAPABILITY REGISTRY — one table, one place, no scattered names.
 *
 * Device access control and privileged attendance management are decided HERE
 * and nowhere else. Every guard in `lib/security/*`, every server action and
 * every route handler asks this module; none of them names a person.
 *
 * ── WHY A CAPABILITY TABLE AND NOT `if (email === "manan@…")` ──────────────
 * The brief asks for Manan to reach the WMS from any device, and for exactly
 * three people to administer devices. Written as inline email tests those rules
 * end up copied into every file that needs them, and the copies drift — which is
 * precisely how `ATTENDANCE_ADMIN_EMAILS` and `CLIENT_LOCATION_EDITOR_EMAILS`
 * came to hold different memberships for what began as one idea (see
 * lib/auth/attendance-permissions.ts). A capability is granted once, in the
 * GRANTS table below, and read by name everywhere else. Adding a second person
 * who may work from any device is one line, in one file, visible in review.
 *
 * ── MATCHED ON EMAIL, NOT EMPLOYEE ID ──────────────────────────────────────
 * Same reasoning as the existing allow-lists: employee uuids differ between
 * production and any restored database, and a stale uuid fails SILENTLY — the
 * person simply finds a capability missing with no error to explain why. The
 * address used is `employees.email` (the APP LOGIN), lowercased, never a
 * correspondence address.
 *
 * ── PURE ───────────────────────────────────────────────────────────────────
 * No `server-only`, no I/O. Client components import these to HIDE controls, and
 * hiding a control is presentation, never authorization: every write path calls
 * the predicate again on the server.
 */

/** The capabilities this security system grants. */
export type SecurityCapability =
  /**
   * `device_restriction_required = false`.
   *
   * The holder reaches the WMS from ANY device — no registered-device check at
   * all. Everyone without it is limited to their registered desktop and phone.
   */
  | "device.exempt_from_restriction"
  /**
   * May approve, register, revoke or otherwise change ANY employee's device
   * authorization. Deliberately narrower than `isAdmin` and narrower than
   * `ATTENDANCE_ADMIN_EMAILS`: whoever can register a device against a person
   * can then act as that person, so this is the hinge the whole guarantee turns
   * on.
   */
  | "device.manage"
  /**
   * May modify ANOTHER employee's attendance, past the employee's own 15-minute
   * correction window, and past the monthly lock.
   *
   * NOT granted by `isAdmin`. An ordinary admin or manager holds none of this —
   * that is the point of the capability existing separately.
   */
  | "attendance.manage_others"
  /** May read the attendance change log (the immutable audit trail). */
  | "attendance.view_audit_log";

/**
 * WHO HOLDS WHAT. The single source of truth.
 *
 * Keys are lowercase `employees.email`. To grant or withdraw a capability, edit
 * this table — it is the only place any of these decisions is written down, and
 * a change shows up in code review and in git history.
 */
const GRANTS: Readonly<Record<string, readonly SecurityCapability[]>> = {
  /**
   * Manan Vasa — founder / super-admin (see lib/auth/founder.ts).
   *
   * `device.exempt_from_restriction` is the brief's Manan exception: he signs in
   * from any laptop or phone without registering it. It is a CAPABILITY, not a
   * name test, so a second super-admin who later needs the same thing is added
   * on the line below rather than by touching the enforcement code.
   *
   * `attendance.manage_others` preserves what he already has today: he is a
   * super-admin, and `superAdminSetPunch` has let super-admins edit anyone's
   * attendance since it was written. The brief names Ruchita and Rutvisha and
   * says the capability must not reach "ordinary admins/managers" — Manan is
   * neither, and is separately exempted throughout. Delete this one entry to
   * make the override exactly the two named people.
   */
  "manan@unleashed.in": [
    "device.exempt_from_restriction",
    "device.manage",
    "attendance.manage_others",
    "attendance.view_audit_log",
  ],

  /** Ruchita Ambre — device administrator + privileged attendance manager. */
  "ruchitaambre.altuscorp@gmail.com": [
    "device.manage",
    "attendance.manage_others",
    "attendance.view_audit_log",
  ],

  /** Rutvisha Mehta — device administrator + privileged attendance manager. */
  "rutvishamehta.altuscorp@gmail.com": [
    "device.manage",
    "attendance.manage_others",
    "attendance.view_audit_log",
  ],
};

/** Does this person hold this capability? The one question every guard asks. */
export function hasCapability(
  email: string | null | undefined,
  capability: SecurityCapability,
): boolean {
  if (!email) return false;
  return (GRANTS[email.trim().toLowerCase()] ?? []).includes(capability);
}

/**
 * Is this person subject to the registered-device restriction?
 *
 * The brief's `device_restriction_required` flag, expressed as the absence of an
 * exemption. Phrased POSITIVELY on purpose: the default for an unknown address
 * is `true` (restricted), so a typo in the grants table above fails closed.
 */
export function deviceRestrictionRequired(email: string | null | undefined): boolean {
  return !hasCapability(email, "device.exempt_from_restriction");
}

/** May approve / register / revoke devices for anyone. */
export function canManageDevices(email: string | null | undefined): boolean {
  return hasCapability(email, "device.manage");
}

/** May modify another employee's attendance, and override the time locks. */
export function canManageOthersAttendance(email: string | null | undefined): boolean {
  return hasCapability(email, "attendance.manage_others");
}

/** May read the attendance change log. */
export function canViewAttendanceAuditLog(email: string | null | undefined): boolean {
  return hasCapability(email, "attendance.view_audit_log");
}

/* ── Refusal messages. Name the CAPABILITY, never the people who hold it. ─── */

export const DEVICE_MANAGE_REFUSAL =
  "Only the device administrators can register, approve or revoke devices.";

export const ATTENDANCE_OTHERS_REFUSAL =
  "You are not authorized to change another employee's attendance.";

export const ATTENDANCE_AUDIT_REFUSAL =
  "You are not authorized to view the attendance change log.";
