/**
 * RETIRED — replaced by `lib/security/device-access.ts` (2026-09).
 *
 * ── WHAT THIS FILE WAS ─────────────────────────────────────────────────────
 * The laptop half of the punch allowlist. It named a browser with a long-lived
 * httpOnly cookie, adopted the first browser each person punched from into a
 * free device slot, and refused anything else — but ONLY at the punch. An
 * unregistered laptop could still sign in and use the rest of the WMS.
 *
 * ── WHY IT IS GONE ─────────────────────────────────────────────────────────
 * Device authorization now gates the whole application, from `requireUser()`,
 * so the rules had to move somewhere both a Server Component and a Server Action
 * can reach. Keeping this module as well would have left TWO implementations of
 * one rule, which the device-access brief explicitly rules out — and they had
 * already diverged: this file counted the cap ACROSS kinds (the 0214 rule),
 * while migration 0215 makes it one approved device per kind. Its enrolment path
 * would have written rows the database then refused, reported as a constraint
 * violation on the punch button.
 *
 * The cookie name, the ten-year lifetime, the adoption behaviour and the
 * `mobile_devices` rows are all UNCHANGED and now live in
 * `lib/security/device-access.ts`, so no employee re-enrolls and no existing
 * device row is invalidated.
 *
 * ── WHY THE FILE REMAINS ───────────────────────────────────────────────────
 * As a signpost. Deleting it outright leaves the next person who greps for
 * `resolveWebDevice` — or who reads the several comments elsewhere that still
 * refer to "the web-device gate" — with nothing to find, and the most likely
 * outcome is that they write a second one. There is nothing to import here.
 */

export {};
