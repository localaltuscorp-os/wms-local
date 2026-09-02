/**
 * WHO DECIDES REMOTE WORK, WHO OWNS CLIENT LOCATIONS, AND WHO ADMINISTERS
 * DEVICES AND ATTENDANCE SETTINGS.
 *
 * Three deliberately narrow allow-lists. Neither is "any admin": approving a day
 * away from the office and defining where a client site physically is are both
 * decisions the firm has assigned to named people, not a capability that should
 * arrive with the admin flag.
 *
 * MATCHED ON EMAIL, NOT EMPLOYEE ID — the same reasoning as
 * `lib/auth/doer-permission.ts`: ids differ between production and any restored
 * database, and a stale uuid here would fail silently. The person would simply
 * find the approve button missing, with no error to explain why. Emails are
 * stable and readable.
 *
 * PURE — no `server-only`, no I/O. Both the server guards and the client
 * components that hide the controls import these, and hiding a control is
 * presentation, never authorization: every action that writes must call the
 * predicate itself.
 */

/**
 * May approve or reject a remote-work request (WFH, Client Site, On Field).
 *
 * Rutvisha, Manan and Om. Note this is NOT the same list as the client-location
 * editors below — Ruchita maintains where clients are without deciding who works
 * away from the office.
 */
export const REMOTE_WORK_APPROVER_EMAILS = [
  "rutvishamehta.altuscorp@gmail.com",
  "manan@unleashed.in",
  // Om — added 2026-09-01, to decide remote-work requests for any employee.
  // As with his ATTENDANCE_ADMIN_EMAILS entry below: this is his APP LOGIN
  // from `employees.email`, lowercase, not a correspondence address.
  "omjadhav.altuscorp@gmail.com",
] as const;

/**
 * May add or edit a client location.
 *
 * Manan, Rutvisha and Ruchita. Everyone else keeps read/use access — they can
 * pick a saved client when requesting Client Site work, but cannot change where
 * that client is, which is what makes the pin trustworthy as a check.
 */
export const CLIENT_LOCATION_EDITOR_EMAILS = [
  "manan@unleashed.in",
  "rutvishamehta.altuscorp@gmail.com",
  "ruchitaambre.altuscorp@gmail.com",
] as const;

/**
 * May change an employee's registered devices, their login/device permissions,
 * or attendance settings.
 *
 * Manan, Rutvisha, Ruchita and Om. Narrower than admin ON PURPOSE, and this is
 * the list where that matters most: whoever can register a device against a
 * person can punch as that person, so leaving it at `requireAdmin()` — every
 * admin in the company — could not hold the property the device allowlist
 * exists to guarantee. No longer the same membership as the client-location
 * editors below; kept separate precisely because they answer different
 * questions, and they have now drifted.
 *
 * This list gates MORE than the Registered Devices page: it also covers the
 * office-IP allowlist and the rest of attendance settings. Adding someone for
 * one of those grants all of them.
 */
export const ATTENDANCE_ADMIN_EMAILS = [
  "manan@unleashed.in",
  "rutvishamehta.altuscorp@gmail.com",
  "ruchitaambre.altuscorp@gmail.com",
  // Om — added 2026-08-27 at his request, to reach Attendance · Registered
  // Devices.
  //
  // This is his APP LOGIN (`employees.email`), which is what `isAttendanceAdmin`
  // is handed. It is not the address he is reachable at elsewhere — the first
  // version of this entry used the latter and granted nothing at all, silently,
  // because the allowlist compares against the employee row and there is no
  // employee row for that address. If you add someone here, take the address
  // from `employees.email`, not from a mail thread.
  //
  // Lowercase, because `matches` lowercases the incoming email and compares
  // literally; a capitalised entry would never match.
  "omjadhav.altuscorp@gmail.com",
] as const;

function matches(list: readonly string[], email: string | null | undefined): boolean {
  if (!email) return false;
  return list.includes(email.trim().toLowerCase());
}

/** Can this person decide a remote-work request? */
export function canApproveRemoteWork(email: string | null | undefined): boolean {
  return matches(REMOTE_WORK_APPROVER_EMAILS, email);
}

/** Can this person add or edit client locations? */
export function canEditClientLocations(email: string | null | undefined): boolean {
  return matches(CLIENT_LOCATION_EDITOR_EMAILS, email);
}

/**
 * Can this person administer devices and attendance settings?
 *
 * `isAdmin` is deliberately NOT consulted — if it were, the rule would be
 * "admins plus these three", which is the rule this list exists to replace.
 */
export function isAttendanceAdmin(email: string | null | undefined): boolean {
  return matches(ATTENDANCE_ADMIN_EMAILS, email);
}

/** The refusal shown when anyone else tries. Names the capability, not the people. */
export const ATTENDANCE_ADMIN_REFUSAL =
  "Only the attendance administrators can change registered devices or attendance settings.";
