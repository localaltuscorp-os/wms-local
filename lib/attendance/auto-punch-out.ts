/**
 * THE FORGOTTEN-LOGOUT STAMP — written in one place, recognised in one place.
 *
 * When an employee clocks IN and never clocks OUT, the nightly job
 * (`app/api/cron/attendance-autoout`) closes the day at 23:59 Asia/Kolkata by
 * writing an out-punch at the CLOCK-IN time. The pair then reads as zero minutes
 * worked, and the grader floors the day at Half Day rather than letting the
 * ordinary three-tier rule call it Absent.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * That behaviour depends on a row shape — `source='admin'`, `reason='forgot'`,
 * `recorded_by_id IS NULL` — agreed between the job that writes it, the grader
 * that reads it, and the self-correction guard that refuses to let an employee
 * edit it. Until now the writer spelled the three fields out inline and the
 * reader had its own private copy of the test, with a comment warning that
 * changing one would "silently break" the other. Three call sites and a comment
 * asking people to be careful is exactly the arrangement that eventually drifts,
 * and the failure is silent: forgotten logouts quietly grade as Absent, or a
 * corrected day quietly stays floored at half.
 *
 * So the stamp and the test live here, next to each other, and every caller
 * imports them. Changing the shape now means changing it once.
 *
 * PURE — no `server-only`, no I/O, so the cron, the query layer and the tests
 * can all import it.
 */

/** The exact field values that mark an out-punch as the system's own. */
export const AUTO_PUNCH_OUT_STAMP = {
  source: "admin",
  reason: "forgot",
  /** NULL is the discriminator. A human attendance manager fixing exactly this
   *  situation picks the same source and the same reason — but their correction
   *  carries `recordedById`, and must NOT stay floored at half a day. */
  recordedById: null,
} as const;

/** The note stored on the row, so the punch log reads as an explanation rather
 *  than an unexplained admin edit. */
export const AUTO_PUNCH_OUT_NOTE =
  "Auto check-out — no clock-out was recorded before 11:59 PM. Day marked Half Day (forgotten-logout policy).";

/** As much of a punch row as the test needs. */
export interface AutoPunchOutCandidate {
  source?: string | null;
  reason?: string | null;
  recordedById?: string | null;
}

/**
 * Was this out-punch written by the forgotten-logout job?
 *
 * ALL THREE conditions matter. `source='admin'` alone is any admin correction;
 * `reason='forgot'` is what a human admin picks for this situation too. Only the
 * job leaves `recordedById` null, and that is what separates "the system closed
 * your day" from "someone fixed your day".
 */
export function isSystemAutoPunchOut(row: AutoPunchOutCandidate): boolean {
  return (
    row.source === AUTO_PUNCH_OUT_STAMP.source &&
    row.reason === AUTO_PUNCH_OUT_STAMP.reason &&
    !row.recordedById
  );
}
