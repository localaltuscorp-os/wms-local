/**
 * Pure Mon/Thu cadence math for the weekly-goals fill gate (design §6). No DB,
 * no server-only — safe to unit-test and import anywhere. The team reports
 * twice a week: every Monday and every Thursday, in IST.
 */
import { istYmd } from "@/lib/weekly-goals/week";

/** Today's IST weekday: 1 = Monday … 7 = Sunday. */
export function istWeekday(now: Date = new Date()): number {
  const dow = new Date(`${istYmd(now)}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  return dow === 0 ? 7 : dow;
}

/** True on the two mandatory reporting days (Monday, Thursday). */
export function isGateDay(now: Date = new Date()): boolean {
  const wd = istWeekday(now);
  return wd === 1 || wd === 4;
}

/**
 * The mandatory checkpoint instant — IST-midnight today — when today is a gate
 * day; otherwise null (no gate). Progress recorded on/after this counts as
 * reported for the checkpoint, so filling Monday still prompts again Thursday.
 */
export function gateCheckpoint(now: Date = new Date()): Date | null {
  if (!isGateDay(now)) return null;
  return new Date(`${istYmd(now)}T00:00:00+05:30`); // IST midnight today, as a UTC instant
}
