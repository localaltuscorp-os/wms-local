// WHO MAY TAKE WHICH LEAVE - the single branch point for leave entitlement by
// employment archetype, sitting beside `worker-type.ts` for the same reason that
// file exists: "how is this person treated" must be answered in ONE place, or
// the picker, the server action and the balance card each grow their own copy
// and drift.
//
// The rule (Sir, 2026-08):
//   · full_time                                → Paid Leave AND Unpaid Leave
//   · afternoon_shift / part_time / project_remote → Unpaid Leave ONLY
//
// The three non-full-time archetypes are the college-shift, part-time and
// contract/retainer people. They are not on a monthly CTC that a paid day off
// can be carved out of - an afternoon-shift or part-time employee is paid for
// the hours they work, and a project/remote worker is on a fixed fee - so a
// "paid leave" would either mean nothing or mean a raise. Unpaid leave is the
// honest instrument for all three: the day is simply not worked.
//
// Paid leave is therefore never OFFERED to them (the picker renders one option)
// and never ACCEPTED from them (the server action refuses it) - UI and guard
// read this same function.

import { LEAVE_KINDS, type LeaveKind, type WorkerType } from "@/db/enums";
import { asWorkerType } from "./worker-type";

/** Only a full-timer accrues paid leave. */
export function isPaidLeaveEligible(w: WorkerType): boolean {
  return w === "full_time";
}

/** The leave kinds this worker type may request, in picker order. */
export function allowedLeaveKinds(w: WorkerType): readonly LeaveKind[] {
  return isPaidLeaveEligible(w) ? LEAVE_KINDS : (["unpaid"] as const);
}

/** Guard form of `allowedLeaveKinds` - used by the server actions. */
export function leaveKindAllowedFor(w: WorkerType, kind: LeaveKind): boolean {
  return allowedLeaveKinds(w).includes(kind);
}

/** Same, from an untrusted `employees.worker_type` string. */
export function leaveKindAllowedForRaw(
  workerType: string | null | undefined,
  kind: LeaveKind,
): boolean {
  return leaveKindAllowedFor(asWorkerType(workerType), kind);
}

/** The message shown when a non-eligible employee asks for paid leave. */
export function paidLeaveRefusalFor(w: WorkerType): string {
  const kind =
    w === "hybrid"
      ? "hybrid"
      : w === "second_half" || w === "first_half"
        ? "half-day shift"
        : "contract / project";
  return `Paid leave isn't available for ${kind} employees - only unpaid leave can be requested.`;
}
