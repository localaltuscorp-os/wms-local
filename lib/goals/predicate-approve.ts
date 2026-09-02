import "server-only";
import { getManagerApproveState } from "./queries";
import { prevWeekStart } from "@/lib/weekly-goals/week";

/**
 * SHARED GATE PREDICATE — "has this manager approved their downline's week?"
 *
 * Consumed by the GATES slice (Monday attendance-mark gate) via
 * `lib/goals/gates-predicates.ts`. Kept in its OWN file so the APPROVE slice and
 * the COMMIT slice fill separate functions with no merge collision.
 *
 * SATISFIED when — for the manager's full active downline — BOTH:
 *   • LAST week's progress rows are approved (`approved_by_manager_at` set), and
 *   • THIS week's committed goals are approved,
 * for every downline member who has adopted, non-archived weekly goals in that
 * week. A person with no downline (not a manager) passes trivially, and a member
 * with zero goals in a week never blocks (they simply don't appear in the
 * grouped read — same semantics as `getManagerApproveState`).
 *
 * `weekStart` is the Monday being clocked into (this week); last week is derived.
 * Reuses `getManagerApproveState` (the single grouped downline read) rather than
 * re-querying, so the gate and the on-screen approval surface stay in lock-step.
 *
 * MUST fail OPEN: any error returns `true` so a DB blip never blocks a manager's
 * attendance mark (design §0 — every daily-flow gate is fail-open + kill-switched).
 */
export async function managerApproveSatisfied(
  managerId: string,
  weekStart: string,
): Promise<boolean> {
  try {
    const [thisWeek, lastWeek] = await Promise.all([
      getManagerApproveState(managerId, weekStart),
      getManagerApproveState(managerId, prevWeekStart(weekStart)),
    ]);
    return thisWeek.allApproved && lastWeek.allApproved;
  } catch {
    // Fail OPEN — a read failure must never lock a manager out of attendance.
    return true;
  }
}
