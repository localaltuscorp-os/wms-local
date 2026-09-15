/**
 * WHEN A TEMPORARY DELEGATED ACCESS GRANT ENDS.
 *
 * PURE — no `server-only`, no I/O, no `new Date()` of its own. Every input is
 * passed in, so the rule is unit-testable at any clock time and the admin UI can
 * preview the same answer the server will store.
 *
 * ── THE RULE, AS THE BRIEF STATES IT ───────────────────────────────────────
 *
 *     expiry = max(start + selectedDuration, same-day 20:30)
 *
 * The LATER of the two wins. The brief is explicit that this is not "whichever
 * happens first", and gives both worked examples:
 *
 *   · 18:00 + 1 hour → selected 19:00, floor 20:30 → expires 20:30 (floor wins)
 *   · 18:00 + 4 hours → selected 22:00, floor 20:30 → expires 22:00 (choice wins)
 *
 * So 20:30 is a FLOOR, not a cap: a grant is always usable until the end of the
 * working evening, and a longer selection extends past it.
 *
 * ── WHY A FLOOR AT ALL ─────────────────────────────────────────────────────
 * Worth stating because it reads like a cap at first glance and someone will
 * eventually "fix" it. The purpose is that a manager granting access at 18:00
 * for testing does not have to guess how long the testing will take — the grant
 * survives to the end of the evening regardless. The duration only matters when
 * it asks for MORE than that.
 *
 * ── "SAME DAY" MEANS THE START'S IST DAY ───────────────────────────────────
 * The company works in Asia/Kolkata (`employees.timezone` defaults to it, and
 * every attendance date in the system is keyed to it), so 20:30 is 20:30 IST.
 * The date is the one the START instant falls on IN IST — not UTC, and not the
 * viewer's clock. A grant created at 02:00 IST on the 11th is floored at 20:30
 * IST on the 11th, which is the same evening the person is working.
 *
 * A grant that starts AFTER the floor is handled by the formula with no special
 * case: 21:00 + 1 hour → max(22:00, 20:30) → 22:00. The floor is simply already
 * in the past and loses.
 */

/** The daily floor, IST. Both halves are read by the UI when it explains the rule. */
export const DELEGATED_ACCESS_FLOOR_HOUR_IST = 20;
export const DELEGATED_ACCESS_FLOOR_MINUTE_IST = 30;

/** "20:30" — for labels, so the string and the numbers above cannot drift. */
export const DELEGATED_ACCESS_FLOOR_LABEL = `${String(DELEGATED_ACCESS_FLOOR_HOUR_IST).padStart(2, "0")}:${String(DELEGATED_ACCESS_FLOOR_MINUTE_IST).padStart(2, "0")}`;

/**
 * India Standard Time, in minutes east of UTC.
 *
 * A FIXED OFFSET, deliberately. India has observed no daylight saving since
 * 1945 and has a single zone nationwide, so IST is UTC+05:30 at every instant
 * this application will ever be handed. That makes the floor computable with
 * arithmetic instead of a timezone database, which matters because this module
 * is pure and is also imported by the client — the alternative is `Intl` calls
 * whose results a test cannot pin.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The durations the Admin Panel offers, in minutes. */
export const DELEGATED_ACCESS_DURATIONS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
] as const;

/** The hard ceiling the DB CHECK also enforces (`duration_minutes <= 1440`). */
export const DELEGATED_ACCESS_MAX_MINUTES = 1440;

export function isValidDelegatedDuration(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes > 0 && minutes <= DELEGATED_ACCESS_MAX_MINUTES;
}

/**
 * 20:30 IST on the IST calendar day that `instant` falls on, as a UTC instant.
 *
 * Derived by shifting into IST, truncating to the day, adding the floor time,
 * and shifting back — rather than by formatting to a string and re-parsing it,
 * which is where this kind of code usually acquires an off-by-one at the
 * midnight boundary.
 */
export function istFloorFor(instant: Date): Date {
  const shifted = instant.getTime() + IST_OFFSET_MINUTES * MINUTE_MS;
  // Truncate to IST midnight. `Math.floor` (not a modulo on a possibly-negative
  // value) so dates before 1970 land on the right day too.
  const istMidnight = Math.floor(shifted / DAY_MS) * DAY_MS;
  const floorInIst =
    istMidnight +
    (DELEGATED_ACCESS_FLOOR_HOUR_IST * 60 + DELEGATED_ACCESS_FLOOR_MINUTE_IST) * MINUTE_MS;
  return new Date(floorInIst - IST_OFFSET_MINUTES * MINUTE_MS);
}

/**
 * THE EXPIRY. `max(startsAt + durationMinutes, 20:30 IST on the start's IST day)`.
 *
 * @param startsAt when the grant begins (normally "now" at grant time)
 * @param durationMinutes what the manager selected
 */
export function delegatedExpiry(startsAt: Date, durationMinutes: number): Date {
  const selected = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
  const floor = istFloorFor(startsAt);
  // The LATER of the two. Not `Math.min` — see this file's header.
  return selected.getTime() >= floor.getTime() ? selected : floor;
}

/** Which of the two terms decided the expiry — the admin UI says so out loud, so
 *  a manager who picked "1 hour" is not surprised by a 20:30 end time. */
export function delegatedExpiryBasis(
  startsAt: Date,
  durationMinutes: number,
): "selected_duration" | "evening_floor" {
  const selected = startsAt.getTime() + durationMinutes * MINUTE_MS;
  return selected >= istFloorFor(startsAt).getTime() ? "selected_duration" : "evening_floor";
}

/**
 * Is this grant usable at `now`?
 *
 * The ONE liveness predicate, so the resolver, the admin list and the tests all
 * agree. Revocation is checked FIRST and independently of the clock: a revoked
 * grant is dead immediately and does not wait for its timer.
 *
 * Takes the fields rather than the row type so it can be called from a client
 * component with a plain object.
 */
export function isDelegationLive(
  grant: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): boolean {
  if (grant.revokedAt != null) return false;
  return now.getTime() < grant.expiresAt.getTime();
}

/** Why a grant is not live — for the audit log's `kind` and for the UI's label. */
export function delegationState(
  grant: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): "live" | "revoked" | "expired" {
  if (grant.revokedAt != null) return "revoked";
  return now.getTime() < grant.expiresAt.getTime() ? "live" : "expired";
}

/** "20:30 IST" / "22:00 IST" — a stable label for an instant, in the org clock. */
export function istClockLabel(instant: Date): string {
  const shifted = instant.getTime() + IST_OFFSET_MINUTES * MINUTE_MS;
  const minutesIntoDay = Math.floor((shifted % DAY_MS) / MINUTE_MS);
  const safe = ((minutesIntoDay % 1440) + 1440) % 1440;
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm} IST`;
}
