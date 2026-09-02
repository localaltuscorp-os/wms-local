/**
 * Pure IST day-of-week helpers for the Goals daily-flow gates.
 *
 * The Saturday commit gate and the weekday-only DCC punch-out guard both need to
 * know "what day is it, in the team's clock (IST)". Kept here — not in
 * lib/weekly-goals/week.ts (owned by the weekly engine) — so the GATES slice
 * doesn't touch shared weekly infra. No DB, no I/O; safe to import anywhere.
 */

const TZ = "Asia/Kolkata";

const DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Day of week in IST — 0 (Sun) … 6 (Sat). */
export function istDow(now: Date = new Date()): number {
  const name = now.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
  return DOW[name] ?? 0;
}

/** True on Saturday, IST. */
export function isSaturdayIST(now: Date = new Date()): boolean {
  return istDow(now) === 6;
}

/** True Mon–Fri, IST (i.e. a normal working weekday). */
export function isWeekdayIST(now: Date = new Date()): boolean {
  const d = istDow(now);
  return d >= 1 && d <= 5;
}
