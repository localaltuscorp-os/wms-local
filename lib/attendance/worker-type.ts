// Worker-type resolver — maps an employee's `worker_type` to its PAY BASIS
// (how salary is computed) and GRADING MODE (how attendance is measured). This
// is the single branch point the salary engine and the grader read, so the
// mapping lives in exactly one place. See db/enums.ts for the unions.

import {
  type WorkerType,
  type PayBasis,
  type GradingMode,
  WORKER_TYPES,
} from "@/db/enums";

export type { WorkerType, PayBasis, GradingMode };
export { WORKER_TYPES };

/** Human labels for pickers / badges. */
export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  full_time: "Full Time",
  first_half: "First Half",
  second_half: "Second Half",
  hybrid: "Hybrid",
  project_remote: "Project / Remote",
};

/**
 * What the Employee Type picker offers. `project_remote` is deliberately absent:
 * it has no employees and is not part of the taxonomy, but its value still has
 * live code behind it (session grading, lib/queries/work-sessions), so it stays
 * in `WORKER_TYPES` rather than being deleted to tidy a dropdown.
 */
export const EMPLOYEE_TYPE_OPTIONS: readonly WorkerType[] = [
  "full_time",
  "first_half",
  "second_half",
  "hybrid",
] as const;

/**
 * ONLY a full-timer is paid a monthly CTC. Everyone else is paid for the hours
 * they actually work (Sir, 2026-08): part-time, first-half and second-half all
 * bill hourly, so a light month is a light payslip rather than a monthly figure
 * paid for a handful of hours. Project/remote stays a fixed retainer — a
 * retainer is not hours, and the type carries no employees anyway.
 */
export function payBasisFor(w: WorkerType): PayBasis {
  return w === "full_time" ? "monthly_ctc" : w === "project_remote" ? "fixed_fee" : "hourly";
}

/**
 * The monthly figure that anchors an HOURLY worker's rate and cap:
 * `hourlyRate = anchor ÷ (weeklyTargetHours × daysInMonth/7)`.
 *
 * SINGLE SOURCE = the salary profile's "Monthly pay at target" (Sir, 2026-08).
 * That is the field the Admin Panel shows and the admin edits for EVERY hourly
 * worker — part-time, first-half and second-half alike — so it must be what
 * drives base pay. `monthlyPayAtTarget` therefore wins whenever it is set. Only
 * when it is genuinely UNSET (0/null — the legacy college/afternoon-shift rows
 * that still carry their salary as an Annual CTC) does it fall back to CTC/12,
 * so nobody's pay drops before the admin moves the figure into the field.
 */
export function hourlyMonthlyAnchor(
  p: { annualCtc: number; monthlyPayAtTarget: number },
): number {
  if (p.monthlyPayAtTarget > 0) return p.monthlyPayAtTarget;
  return p.annualCtc > 0 ? p.annualCtc / 12 : 0;
}

/** part-time → hours target, project → work sessions, else day grading. */
export function gradingModeFor(w: WorkerType): GradingMode {
  return w === "hybrid" ? "hours" : w === "project_remote" ? "session" : "day";
}

/**
 * THE HOURLY-SHIFT CATEGORY — part-time and afternoon/college shift.
 *
 * Sir, 2026-08: these two are ONE category. Same short day (4.5h), same week
 * (27h), and both are paid for hours worked beyond it. The only thing that still
 * separates them is where their monthly figure comes from — a part-timer has an
 * agreed `monthly_pay_at_target`, an afternoon-shift employee has a CTC — which
 * is `payBasisFor`'s business, not this one's.
 *
 * Defined ONCE and consumed everywhere (the schedule resolver, the Admin Panel's
 * requirement line, the overtime gate) so the two can never drift apart again:
 * afternoon shift used to inherit the full-timer's 9h/54h simply by not being
 * `part_time`, which is exactly the kind of default that quietly prices someone
 * against a week they were never asked to work.
 */
export function isHourlyShift(w: WorkerType): boolean {
  return w === "hybrid" || w === "second_half" || w === "first_half";
}

/**
 * The two HALF-DAY shifts — a morning or an afternoon slot rather than a whole
 * day.
 *
 * Narrower than {@link isHourlyShift}, and the difference is load-bearing:
 * `hybrid` is also hourly, but it is paid against an agreed monthly figure and
 * carries no fixed slot, so it has no explicit full/half-day minutes to keep.
 * Only these two do. Collapsing the two predicates would hand `hybrid` a pair
 * of day-minute columns it has no meaning for.
 */
export function isHalfDayShift(w: WorkerType): boolean {
  return w === "first_half" || w === "second_half";
}

/**
 * Does this worker type get PAID for hours worked beyond the monthly target?
 *
 * Only the hourly-graded shifts do — part-time and afternoon/college-shift, the
 * people the firm treats as interns. A full-timer who works 56h in a week keeps
 * the 2h surplus as CREDIT against a later short week in the same month (see
 * `reconcileMonth`), but is never paid cash for it; overtime is not part of a
 * salaried role here. Project/remote is on a retainer, so hours never move the
 * amount at all.
 *
 * The surplus itself is computed identically for everyone — this flag only
 * decides whether the month-end remainder converts to money. Kept beside
 * `payBasisFor` and `gradingModeFor` so "how is this person treated" stays one
 * branch point rather than a condition copied into the payroll code.
 */
export function earnsOvertime(w: WorkerType): boolean {
  return isHourlyShift(w);
}

/**
 * Values this column held before 0204 renamed them.
 *
 * LOAD-BEARING, not tidiness: `asWorkerType` falls back to `full_time`, and a
 * full-timer is graded on a 9h day with no overtime. If this code reaches
 * production before the migration does — which is the normal order here, since
 * nothing applies migrations on deploy — then without this map the four
 * second-half employees and the one hybrid would silently be graded and priced
 * as full-timers. Mapping them costs nothing and stays correct either way.
 */
const LEGACY_WORKER_TYPES: Record<string, WorkerType> = {
  afternoon_shift: "second_half",
  part_time: "hybrid",
};

/** Narrow an untrusted string to a WorkerType, defaulting to full_time. */
export function asWorkerType(v: string | null | undefined): WorkerType {
  const raw = v ?? "";
  if ((WORKER_TYPES as readonly string[]).includes(raw)) return raw as WorkerType;
  return LEGACY_WORKER_TYPES[raw] ?? "full_time";
}
