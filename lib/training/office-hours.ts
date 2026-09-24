/**
 * Office-hours overlap maths — PURE, and deliberately NOT in the `"use server"`
 * actions module: a `"use server"` file may only export async functions, so a
 * plain helper living there fails the production build
 * ("Server Actions must be async functions").
 */

/** "HH:mm" → minutes since midnight. */
export function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Minutes of the self-learning window that fall inside office hours. The window
 * may cross midnight (end ≤ start ⇒ +24h), and the office may be reached on the
 * following day too, so both the same-day and next-day office spans are checked.
 */
export function overlapWithOfficeMinutes(
  startTime: string,
  endTime: string,
  officeStart: string,
  officeEnd: string,
): number {
  let s = hhmmToMin(startTime);
  let e = hhmmToMin(endTime);
  if (e <= s) e += 1440;
  const os = hhmmToMin(officeStart);
  const oe = hhmmToMin(officeEnd);
  const overlap = (a: number, b: number, c: number, d: number) =>
    Math.max(0, Math.min(b, d) - Math.max(a, c));
  return overlap(s, e, os, oe) + overlap(s, e, os + 1440, oe + 1440);
}
