import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { mondayOf, nextWeekStart } from "@/lib/weekly-goals/week";
import { getWeekCommitState } from "./queries";

/**
 * SHARED GATE PREDICATE — "has this employee committed (frozen) their week?"
 *
 * Consumed by the GATES slice (Saturday punch-out gate) via
 * `lib/goals/gates-predicates.ts`. Implemented by the COMMIT slice (Module 2).
 *
 * The Saturday commit is TWO tasks (design §6, Module 2):
 *   (1) fill THIS week's progress on every current weekly goal, and
 *   (2) commit + freeze NEXT week's goals.
 * So `weekCommitSatisfied(employeeId, weekStart)` is true only when BOTH hold
 * for `weekStart` (the week that is ending — the anchor the punch-out gate
 * passes):
 *   (1) every adopted, non-archived weekly goal of `weekStart` has its progress
 *       filled (`pct_updated_at` stamped — the honest "the doer touched it"
 *       signal; `pct_done` alone is ambiguous because it defaults to 0), and
 *   (2) the NEXT week (`nextWeekStart(weekStart)`) is fully committed — ≥1
 *       adopted goal and every one carries a `committed_at` freeze stamp
 *       (`getWeekCommitState(...).allCommitted`).
 *
 * A week with zero goals this week is vacuously "filled" (nothing to progress);
 * next week must still hold ≥1 frozen goal to satisfy the gate.
 *
 * MUST fail OPEN: any error returns `true` so a DB blip never blocks punch-out.
 */
export async function weekCommitSatisfied(
  employeeId: string,
  weekStart: string,
): Promise<boolean> {
  try {
    const anchor = mondayOf(weekStart);
    const nextWeek = nextWeekStart(anchor);

    // (1) This week's progress — every adopted, non-archived goal has been touched.
    const thisWeek = await db
      .select({ pctUpdatedAt: weeklyGoals.pctUpdatedAt })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, employeeId),
          eq(weeklyGoals.weekStart, anchor),
          eq(weeklyGoals.archived, false),
          eq(weeklyGoals.adopted, true),
        ),
      );
    const progressFilled = thisWeek.every((r) => r.pctUpdatedAt != null);

    // (2) Next week is frozen (≥1 adopted goal, every one committed).
    const next = await getWeekCommitState(employeeId, nextWeek);

    return progressFilled && next.allCommitted;
  } catch {
    // FAIL OPEN — a read error must never trap someone at punch-out.
    return true;
  }
}
