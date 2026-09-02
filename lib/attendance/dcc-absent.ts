import "server-only";
import { listItemsForOwners, listEntriesForOwners, type DccItemRow } from "@/lib/queries/dcc";
import { scheduledDueOn } from "@/lib/dcc/util";
import type { DayCodeResult } from "@/lib/attendance/status";

/**
 * WS-3 — DCC → Attendance ("DCC not filled ⇒ ABSENT").
 *
 * This is an ADDITIVE, kill-switched layer that sits AFTER the pure day-grader
 * (`computeDayCode`). When the person had scheduled DCC due for a day but did
 * not fill it, and they were otherwise graded as PRESENT, we downgrade the day
 * to ABSENT.
 *
 * SAFETY (attendance is money-critical):
 *  - Gated behind the `DCC_ABSENT` env kill-switch, DEFAULT OFF. With the flag
 *    off, `applyDccAbsent` returns the input result byte-identical and the
 *    `getDccUnfilledDates` loader short-circuits to an empty map — ZERO change
 *    to any live attendance number.
 *  - We only ever downgrade *present-type* codes (P / H/D / incomplete). We
 *    NEVER touch already-absent, leave, holiday, weekly-off, comp-off or
 *    holiday-worked codes — so the rule can only ever REMOVE a present credit
 *    that a missing DCC should have cost, never invent presence.
 *  - The loader is fail-OPEN: any DB/DCC error yields an empty unfilled-set, so
 *    a hiccup can never spuriously mark someone absent.
 *  - The loader ignores "today" (and future) — DCC is filled at end of day, so
 *    an unfilled *current* day must not be punished.
 */

/** Kill-switch reader. DEFAULT OFF — must be explicitly set to the string
 *  "true" to activate. Any other value (unset, "false", "0", …) => inert. */
export function dccAbsentEnabled(): boolean {
  return process.env.DCC_ABSENT === "true";
}

/** Codes that represent physical presence on a regular working day and are
 *  therefore eligible to be downgraded when the day's DCC was left unfilled.
 *  Deliberately EXCLUDES holiday/weekly-off/leave/comp-off codes. */
const PRESENT_CODES = new Set<DayCodeResult["code"]>(["P", "H/D", "incomplete"]);

/**
 * Pure post-grade override. Returns a NEW absent result when the flag is on,
 * the day was graded present, and its DCC was unfilled; otherwise returns the
 * input result unchanged (referentially — no mutation).
 *
 * Kept pure (no I/O) so it is trivially unit-testable next to `computeDayCode`.
 */
export function applyDccAbsent(
  result: DayCodeResult,
  dccUnfilled: boolean,
  enabled: boolean,
): DayCodeResult {
  if (!enabled || !dccUnfilled) return result;
  if (!PRESENT_CODES.has(result.code)) return result;
  return {
    code: "A",
    dayValue: 0,
    late: false,
    leftEarly: false,
    lateWaived: false,
    workedMinutes: 0,
  };
}

/** Add `delta` calendar days to a YYYY-MM-DD string (pure, no tz drift). */
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Non-empty status = a real fill (mirrors the DCC gate's `unfilledCount`). */
function isFilled(status: string | null | undefined): boolean {
  return !!(status ?? "").trim();
}

/**
 * For each employee, the set of YYYY-MM-DD dates in [first, last] on which they
 * had at least one SCHEDULED (daily) DCC item due but did NOT fully fill it.
 *
 * Batched: ONE items query + ONE entries query across all employees (no N+1),
 * mirroring the dashboard roster path. Days on/after `refTodayISO` are excluded
 * (the current day's DCC isn't due until end-of-day).
 *
 * @param employeeIds owners to evaluate
 * @param first inclusive range start (YYYY-MM-DD)
 * @param last inclusive range end (YYYY-MM-DD)
 * @param refTodayISO "today" in the caller's tz; this date and later are skipped
 * @returns Map ownerId → Set(unfilled dates). EMPTY on any error (fail-open).
 */
export async function getDccUnfilledDates(
  employeeIds: string[],
  first: string,
  last: string,
  refTodayISO: string,
): Promise<Map<string, Set<string>>> {
  const empty = new Map<string, Set<string>>();
  if (!dccAbsentEnabled() || employeeIds.length === 0) return empty;

  try {
    const [items, entries] = await Promise.all([
      listItemsForOwners(employeeIds),
      listEntriesForOwners(employeeIds, first),
    ]);

    // Only scheduled (daily) non-participant items ever count toward the due-set
    // — same rule as the fill gate and the streak.
    const itemsByOwner = new Map<string, DccItemRow[]>();
    for (const it of items) {
      const l = itemsByOwner.get(it.ownerEmployeeId);
      if (l) l.push(it as DccItemRow);
      else itemsByOwner.set(it.ownerEmployeeId, [it as DccItemRow]);
    }

    // filled[owner] = Set("itemId|date") for entries with a real status.
    const filled = new Set<string>();
    for (const e of entries) {
      if (isFilled(e.status)) filled.add(`${e.ownerEmployeeId}|${e.itemId}|${e.entryDate}`);
    }

    // Walk the range once; the last gradeable day is the day BEFORE refToday.
    const lastGradeable = addDaysYmd(refTodayISO, -1);
    const rangeEnd = last < lastGradeable ? last : lastGradeable;

    const out = new Map<string, Set<string>>();
    for (const [owner, ownItems] of itemsByOwner) {
      const scheduled = ownItems; // scheduledDueOn filters kind/participant per day
      if (scheduled.length === 0) continue;
      let ymd = first;
      while (ymd <= rangeEnd) {
        const day = ymdToDate(ymd);
        const due = scheduled.filter((it) => scheduledDueOn(it, day));
        if (due.length > 0) {
          const anyUnfilled = due.some((it) => !filled.has(`${owner}|${it.id}|${ymd}`));
          if (anyUnfilled) {
            const s = out.get(owner);
            if (s) s.add(ymd);
            else out.set(owner, new Set([ymd]));
          }
        }
        ymd = addDaysYmd(ymd, 1);
      }
    }
    return out;
  } catch {
    // Fail-open: never let a DCC read gate/alter an attendance number.
    return empty;
  }
}
