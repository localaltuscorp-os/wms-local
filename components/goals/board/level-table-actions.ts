"use client";

/**
 * Cascade-engine adapter for the shared inline GoalTableView on the LEVEL
 * boards (Yearly / Quarterly / Monthly). Maps the table's generic edit surface
 * onto the `goals`-table server actions so every cell — Area / Measure / Type
 * dropdowns, Target vs Actual, the %-Done slider, Team % / members, Share, and
 * the bulk archive — commits inline. Mirrors WEEKLY_TABLE_ACTIONS (which drives
 * the weekly_goals engine), giving the level boards editing parity with weekly.
 *
 * This is the same mapping GoalTableView falls back to by default; passing it
 * explicitly keeps the level board symmetric with the weekly board (which also
 * hands its table an adapter) and makes the wiring self-documenting.
 */

import type { GoalTableActions } from "@/components/goals/board/goal-table-view";
import {
  editGoal,
  setGoalPctDone,
  archiveGoal,
  bulkArchiveGoals,
} from "@/app/(app)/goals/cascade/actions";

export const LEVEL_TABLE_ACTIONS: GoalTableActions = {
  // title / area / uom(measure) / category(type) / targetQty / actualQty /
  // weight / teamInvolved / teamDependencyPct / shareWithTeam — editGoal takes
  // any subset and persists exactly the keys present (see EditGoalSchema).
  editGoal: (input) => editGoal(input as Parameters<typeof editGoal>[0]),
  setGoalPctDone: (input) => setGoalPctDone(input),
  archiveGoal: (input) => archiveGoal(input),
  bulkArchiveGoals: (input) => bulkArchiveGoals(input),
};
