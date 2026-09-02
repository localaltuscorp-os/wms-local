import {
  asWorkerType,
  isHalfDayShift,
  isHourlyShift,
  type WorkerType,
} from "@/lib/attendance/worker-type";

/**
 * THE BULK-EDIT MERGE — the one piece of "Edit All" that can silently destroy
 * data, isolated here as a pure function so it can be tested without a database.
 *
 * WHY IT EXISTS: `updateEmployeeAttendanceSchedule` is NOT a sparse patch. It
 * always writes weeklyOff and all four time columns, and it re-derives the
 * salary_profiles rates from whatever it is handed — so calling it with only a
 * worker type would blank every other schedule field and wipe the pay rates for
 * every selected employee. This function is what makes a sparse admin intent
 * ("change only Weekly Off") into the COMPLETE input that action requires,
 * filling every untouched slot from the employee's own current row.
 *
 * THE RULE, in one line: a key absent from `patch` means the employee's current
 * value is carried through verbatim.
 *
 * Note the distinction the time fields have to preserve — present-but-empty is
 * not the same as absent:
 *   · absent  → keep whatever the employee has now
 *   · "" / null → clear the override back to the company default
 */

/** The employee columns the merge reads. Matches the `employees` row shape. */
export interface CurrentSchedule {
  weeklyOff: number;
  attOfficialStart: string | null;
  attLateAfter: string | null;
  attOfficialEnd: string | null;
  attEarlyBefore: string | null;
  workerType: string | null;
  attFullDayMinutes: number | null;
  attHalfDayMinutes: number | null;
  weeklyTargetMinutes: number | null;
}

/** The salary_profiles rates, as numeric columns read back over the wire. */
export interface CurrentRates {
  monthlyPayAtTarget: string | null;
  weeklyTargetHours: string | null;
  monthlyFee: string | null;
}

/** The sparse schedule half of a bulk patch. */
export interface SchedulePatch {
  workerType?: WorkerType;
  weeklyOff?: number;
  attOfficialStart?: string | null;
  attLateAfter?: string | null;
  attOfficialEnd?: string | null;
  attEarlyBefore?: string | null;
}

/** The complete input `updateEmployeeAttendanceSchedule` expects. */
export interface MergedSchedule {
  employeeId: string;
  weeklyOff: number;
  attOfficialStart: string | null;
  attLateAfter: string | null;
  attOfficialEnd: string | null;
  attEarlyBefore: string | null;
  workerType: WorkerType;
  attFullDayMinutes: number | null;
  attHalfDayMinutes: number | null;
  weeklyTargetMinutes: number | null;
  monthlyPayAtTarget: number | null;
  weeklyTargetHours: number | null;
  monthlyFee: number | null;
}

/** numeric column ("3500.00") → number. Blank/garbage → null. */
function numOrNull(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Postgres `time` reads back "HH:mm:ss"; the validator wants "HH:mm". */
function hhmm(v: string | null): string | null {
  return v ? v.slice(0, 5) : null;
}

export function mergeScheduleForBulk(
  employeeId: string,
  current: CurrentSchedule,
  rates: CurrentRates | undefined,
  patch: SchedulePatch,
): MergedSchedule {
  const workerType = patch.workerType ?? asWorkerType(current.workerType);

  return {
    employeeId,
    weeklyOff: patch.weeklyOff ?? current.weeklyOff,
    attOfficialStart:
      patch.attOfficialStart !== undefined
        ? patch.attOfficialStart || null
        : hhmm(current.attOfficialStart),
    attLateAfter:
      patch.attLateAfter !== undefined
        ? patch.attLateAfter || null
        : hhmm(current.attLateAfter),
    attOfficialEnd:
      patch.attOfficialEnd !== undefined
        ? patch.attOfficialEnd || null
        : hhmm(current.attOfficialEnd),
    attEarlyBefore:
      patch.attEarlyBefore !== undefined
        ? patch.attEarlyBefore || null
        : hhmm(current.attEarlyBefore),
    workerType,
    // Type-specific fields are CARRIED OVER, never re-derived: the bulk editor
    // does not expose them, so the employee's current value is the correct one.
    // They are nulled only when the new worker type has no use for them, which
    // mirrors exactly what the single-employee editor submits.
    // The half-day shifts (first/second) carry their own explicit day minutes.
    attFullDayMinutes: isHalfDayShift(workerType) ? current.attFullDayMinutes : null,
    attHalfDayMinutes: isHalfDayShift(workerType) ? current.attHalfDayMinutes : null,
    // Every hourly shift keeps its weekly target; only `hybrid` carries a
    // `monthly_pay_at_target` (the half-day shifts are paid from a CTC).
    weeklyTargetMinutes: isHourlyShift(workerType) ? current.weeklyTargetMinutes : null,
    monthlyPayAtTarget:
      workerType === "hybrid" ? numOrNull(rates?.monthlyPayAtTarget) : null,
    weeklyTargetHours:
      isHourlyShift(workerType) ? numOrNull(rates?.weeklyTargetHours) : null,
    monthlyFee: workerType === "project_remote" ? numOrNull(rates?.monthlyFee) : null,
  };
}
