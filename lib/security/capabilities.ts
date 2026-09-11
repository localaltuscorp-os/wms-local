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
  | "attendance.view_audit_log"
  /**
   * MASTER ADMIN — may open the permission-management module and change who can
   * see, read and edit any module, sub-module or sub-sub-module.
   *
   * The most powerful capability in the application, because it is the one that
   * decides all the others. Held by exactly two people (the brief: "initially
   * available ONLY to Manan and Rohan").
   *
   * Deliberately SEPARATE from `isSuperAdmin`, even though the two lists happen
   * to hold the same addresses today. Super-admin means "may promote and demote
   * admins"; this means "may rewrite the permission matrix". They coincide now
   * and will not always, and collapsing them would mean a third super-admin
   * silently acquires the permission matrix as a side effect of an unrelated
   * grant.
   */
  | "master_admin.manage"
  /**
   * EXEMPT FROM THE COMPULSORY DAILY-START GATES.
   *
   * The holder is never blocked from using the WMS by the post-login walls:
   * Start My Day, the committed-items minimum (3 for an individual contributor,
   * 5 for a manager), or the daily-checklist plan gate.
   *
   * ── AN EXCEPTION TO ENFORCEMENT, NOT A REMOVAL OF THE FEATURE ────────────
   * The gates stay exactly as they are for everybody else. This is one
   * predicate consulted inside the gate functions themselves
   * (lib/daily-checklist/gate.ts), so it applies to every caller — the `(app)`
   * layout, the hub, and anything added later — rather than being re-stated at
   * each call site where one copy would eventually be forgotten.
   *
   * It does NOT touch attendance grading. The holder's days are still graded by
   * the same rules as everyone's: not punching still reads as an absence. This
   * capability is about whether the application refuses to open, which is what
   * "must not be required to Start My Day in order to proceed" asks for.
   */
  | "daily_start.exempt"
  /**
   * May grant TEMPORARY DELEGATED ACCESS to any employee's account, regardless
   * of the reporting hierarchy.
   *
   * A manager does not need this: they may already grant access to their own
   * reports (see `canGrantDelegatedAccessTo`, which reads the org chart). This
   * covers the cases the hierarchy cannot express — a founder testing across
   * teams, or someone standing in while a manager is away.
   */
  | "delegated_access.grant_any";

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
    "master_admin.manage",
    "delegated_access.grant_any",
    /**
     * The daily-start exemption. Manan does not check in, does not run Start My
     * Day, and is not held at the 5-commitment wall — he uses the WMS without
     * being stopped by the post-login rituals.
     *
     * Granted here, to one address, rather than derived from "is the founder"
     * (lib/auth/founder.ts) or from super-admin: both would make the exemption
     * a side effect of an unrelated fact, so a second founder or a third
     * super-admin would silently acquire it. Adding somebody is one line, in
     * this table, visible in review.
     */
    "daily_start.exempt",
  ],

  /**
   * Rohan Choudhary — MASTER ADMIN + device administrator.
   *
   * The second of the two people the brief names for the permission matrix. He
   * is already a super-admin (lib/auth/super-admin.ts).
   *
   * `device.manage` was DELIBERATELY WITHHELD here until 2026-09-11, and the
   * reason it was withheld still stands, so it is recorded rather than deleted:
   * whoever can register a device against a person can then sign in as that
   * person from it, which makes this grant the hinge the device guarantee turns
   * on (see the `device.manage` docstring above). It was added on an explicit
   * operator instruction, making him the fourth device administrator alongside
   * Manan, Ruchita and Rutvisha.
   *
   * `device.exempt_from_restriction` followed on the same day, for a concrete
   * reason: `device.manage` alone did not let him in. The device gate runs
   * BEFORE capabilities are consulted, so his second browser landed `pending`
   * and he could not reach the screen on which he would have approved it — the
   * deadlock the "Manan exception" exists to avoid, reached by the second
   * person to need it. He is now the second holder of that exception.
   *
   * WHAT IT COSTS, stated plainly: he no longer has to register a device, so a
   * stolen password for this account works from any laptop or phone in the
   * world, with no second factor and no device row to revoke. That is the whole
   * protection the device system provides, waived for this account.
   *
   * NOT granted: `attendance.manage_others` and `attendance.view_audit_log`,
   * which Ruchita and Rutvisha hold. Those are a separate power — editing other
   * people's attendance past the lock — and nothing about administering devices
   * requires them. Grants stay itemised per person rather than bundled into a
   * "master admin role" precisely so one can be added without the others
   * following by accident.
   */
  "rohanchoudhary.altuscorp@gmail.com": [
    "device.exempt_from_restriction",
    "device.manage",
    "master_admin.manage",
    "delegated_access.grant_any",
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
 * Every address holding a capability — the REVERSE lookup.
 *
 * Exists so a notification can reach "whoever can approve a device" without
 * naming anybody. The alternative is a second hand-maintained list of
 * recipients, which is the same drift this file exists to prevent: someone
 * granted `device.manage` above would silently not be told about the approvals
 * they are now responsible for.
 *
 * Returns EMAILS, not employee ids, because the grants table is keyed on email
 * for the reasons in this file's header. Callers resolve them to employee rows.
 */
export function emailsWithCapability(capability: SecurityCapability): string[] {
  return Object.entries(GRANTS)
    .filter(([, caps]) => caps.includes(capability))
    .map(([email]) => email);
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

/**
 * MAY OPEN THE MASTER ADMIN PERMISSION MATRIX.
 *
 * ── THIS IS THE WHOLE ANSWER TO "ONLY MANAN AND ROHAN" ─────────────────────
 * Read server-side by the /master-admin layout, by every one of its server
 * actions, and by the permission resolver. There is no client-side branch that
 * decides it: hiding the nav entry is presentation, and the entry is hidden
 * because this predicate said no, never the other way round.
 *
 * Environment-independent by construction. It matches on `employees.email`,
 * which is the same value in local development and on os.altuscorp.com, so the
 * rule cannot differ between the two — there is no env var, no host check and no
 * `NODE_ENV` branch anywhere in this decision. Typing the URL or POSTing to the
 * action reaches the same predicate as clicking the link.
 */
export function isMasterAdmin(email: string | null | undefined): boolean {
  return hasCapability(email, "master_admin.manage");
}

/** May grant temporary delegated access to ANYONE, bypassing the hierarchy.
 *  Managers get a narrower version from the org chart — see
 *  lib/auth/delegation-permission.ts. */
export function canGrantAnyDelegatedAccess(email: string | null | undefined): boolean {
  return hasCapability(email, "delegated_access.grant_any");
}

/**
 * IS THIS PERSON EXEMPT FROM THE COMPULSORY DAILY-START GATES?
 *
 * Read inside the gate functions in lib/daily-checklist/gate.ts, which is the
 * single place the answer is applied — so the `(app)` layout, the hub and any
 * future caller all inherit it, and the front end cannot disagree with the back
 * end about who is exempt.
 *
 * Fails CLOSED: an unknown or absent address is NOT exempt, so a typo in the
 * grants table leaves the gates fully enforced rather than quietly open.
 */
export function isExemptFromDailyStart(email: string | null | undefined): boolean {
  return hasCapability(email, "daily_start.exempt");
}

export const MASTER_ADMIN_REFUSAL =
  "Only the master administrators can change module permissions.";

export const DELEGATED_ACCESS_REFUSAL =
  "You are not authorized to grant temporary access to that account.";

/* ── Refusal messages. Name the CAPABILITY, never the people who hold it. ─── */

export const DEVICE_MANAGE_REFUSAL =
  "Only the device administrators can register, approve or revoke devices.";

export const ATTENDANCE_OTHERS_REFUSAL =
  "You are not authorized to change another employee's attendance.";

export const ATTENDANCE_AUDIT_REFUSAL =
  "You are not authorized to view the attendance change log.";
