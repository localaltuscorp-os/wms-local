/**
 * THE TWO ATTENDANCE TIME RULES, AS PURE FUNCTIONS.
 *
 *   1. A 15-MINUTE SELF-CORRECTION WINDOW. An employee may change their own
 *      punch for 15 minutes after the punch, and not a second longer.
 *   2. A MONTHLY LOCK. A month's attendance locks on the 3rd of the NEXT month;
 *      after that only a privileged attendance manager may change it.
 *
 * ── WHY THIS FILE HAS NO DATABASE AND NO `server-only` ─────────────────────
 * These are the rules the whole feature turns on, so they must be testable
 * without a Postgres instance, and readable in one sitting. Everything that
 * needs I/O — who you are, which device you are on, what the punch currently
 * says — lives in `attendance-authorization.ts`, which calls these.
 *
 * ── THE CLOCK IS ALWAYS THE SERVER'S ───────────────────────────────────────
 * Every function takes `now` as an argument so tests can pin it, but no CALLER
 * in the app ever passes a client-supplied time. The authorization service
 * passes `new Date()`. A browser that lies about the time changes nothing.
 *
 * ── THE LOCK IS EVALUATED IN THE ORGANISATION'S TIMEZONE ───────────────────
 * "The 3rd of the following month" is a calendar statement, and a calendar needs
 * a timezone. Asia/Kolkata is the company's, matching `clockInTz` and the
 * `timezone` default used across the attendance stack. Evaluated in UTC instead,
 * the lock would land 5h30m late for everyone — a real five-and-a-half-hour hole
 * on the 3rd, every month.
 */

/** The employee's own correction window, in minutes. */
export const SELF_CORRECTION_WINDOW_MINUTES = 15;

/** Day-of-month on which the PREVIOUS month's attendance becomes locked. */
export const MONTH_LOCK_DAY = 3;

/** The company clock. One constant, so the two rules can never disagree. */
export const ORG_TIMEZONE = "Asia/Kolkata";

/* ── 1. The 15-minute self-correction window ──────────────────────────────── */

export interface SelfWindow {
  /** Is the punch still inside the employee's own correction window? */
  open: boolean;
  /** When the window shuts. */
  expiresAt: Date;
  /** Whole seconds left, floored at 0 — for the UI countdown and the message. */
  secondsRemaining: number;
}

/**
 * Where a punch sits relative to its 15-minute window.
 *
 * Measured from `punchedAt` — the punch's OWN `logged_at`, not the row's
 * creation time and not the date being edited. A 10:00 check-in is correctable
 * until 10:15, whether that correction is attempted at 10:14 or a week later.
 *
 * The boundary is EXCLUSIVE: at exactly 10:15:00.000 the window is shut. A rule
 * stated as "15 minutes" should not grant a sixteenth minute on a tie, and a
 * closed boundary is the kind of detail that only ever surfaces as an argument
 * about whether an edit at exactly the limit should have been allowed.
 */
export function selfCorrectionWindow(punchedAt: Date, now: Date): SelfWindow {
  const expiresAt = new Date(punchedAt.getTime() + SELF_CORRECTION_WINDOW_MINUTES * 60_000);
  const msLeft = expiresAt.getTime() - now.getTime();
  return {
    open: msLeft > 0,
    expiresAt,
    secondsRemaining: msLeft > 0 ? Math.floor(msLeft / 1000) : 0,
  };
}

/** The refusal an employee sees once their own window has shut. */
export function selfWindowRefusal(punchedAt: Date): string {
  return (
    `You can only correct a punch within ${SELF_CORRECTION_WINDOW_MINUTES} minutes of making it. ` +
    `This punch was recorded at ${formatInOrgTz(punchedAt)} and can no longer be changed by you — ` +
    `ask an attendance manager to correct it.`
  );
}

/* ── 2. The monthly lock ──────────────────────────────────────────────────── */

/**
 * The instant a given month locks: the 3rd of the FOLLOWING month at 00:00
 * Asia/Kolkata, returned as a UTC `Date`.
 *
 * September 2026 → 2026-10-03T00:00+05:30 → 2026-10-02T18:30Z.
 *
 * December rolls the year, which is why the month arithmetic goes through
 * `Date.UTC` with a month index that is allowed to reach 12 rather than being
 * computed by hand.
 */
export function monthLockInstant(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw new Error(`monthLockInstant: bad month "${month}" (expected YYYY-MM)`);
  // Midnight on the 3rd of the next month, as a wall clock in the org timezone.
  const wallClockUtc = Date.UTC(y, m /* already next month: m is 1-based */, MONTH_LOCK_DAY, 0, 0, 0);
  return new Date(wallClockUtc - orgUtcOffsetMs());
}

/**
 * Is the month containing `logDate` locked as of `now`?
 *
 * Takes "YYYY-MM-DD" or "YYYY-MM" — every caller has one or the other, and
 * making them normalise first is how a caller eventually passes a full date to
 * something expecting a month.
 */
export function isMonthLocked(dateOrMonth: string, now: Date): boolean {
  return now.getTime() >= monthLockInstant(toMonth(dateOrMonth)).getTime();
}

/** The refusal shown to anyone without the override capability. */
export function monthLockRefusal(dateOrMonth: string): string {
  const month = toMonth(dateOrMonth);
  return (
    `Attendance for ${month} locked on the ${MONTH_LOCK_DAY}${ordinal(MONTH_LOCK_DAY)} of the ` +
    `following month and can no longer be changed. Ask an attendance manager if a correction is needed.`
  );
}

/** "YYYY-MM-DD" or "YYYY-MM" → "YYYY-MM". */
export function toMonth(dateOrMonth: string): string {
  return dateOrMonth.slice(0, 7);
}

/* ── Timezone helpers ─────────────────────────────────────────────────────── */

/**
 * Asia/Kolkata's offset from UTC in milliseconds (+05:30).
 *
 * A CONSTANT, not an `Intl` round-trip: India has had a single offset since
 * 1945 and observes no daylight saving, so there is nothing to look up. Written
 * as a function so that a future org in a DST timezone has one obvious place to
 * make it depend on the date, rather than a bare number scattered through the
 * arithmetic above.
 */
function orgUtcOffsetMs(): number {
  return 5.5 * 60 * 60 * 1000;
}

/** "09 Sep 2026, 10:00" in the org timezone — for refusal messages only. */
export function formatInOrgTz(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
}
