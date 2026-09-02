/**
 * Client-safe daily-checklist constants. Lives OUTSIDE `gate.ts` because that
 * module is `server-only` (it queries the DB) — importing anything from it into
 * a `"use client"` component fails `next build` ("server-only imported from a
 * Client Component"). The minimum lives here so the gate UI, the page, and the
 * server gate/actions can all share one source of truth without dragging the
 * server-only module into the client bundle.
 */

/** Minimum items a user must plan to "Start my day". Single source of truth —
 *  the server wall (layout + hub via needsDailyChecklistPlan) AND the client
 *  gate (daily-plan-gate.tsx `met`) both read THIS, so they can never drift. */
export const MIN_DAILY_ITEMS = 3;

/**
 * Minimum items on today's plan before an employee may CLOCK IN.
 *
 * Deliberately separate from `MIN_DAILY_ITEMS` above. That one is the
 * post-login wall's threshold; this one gates attendance, and the two are set
 * by different decisions. Folding them into a single number would mean every
 * future change to one silently moved the other.
 */
export const MIN_ATTENDANCE_ITEMS = 5;
