"use client";

/**
 * Weekly engine adapter for the shared inline GoalTableView. Maps the table's
 * generic mutation surface onto the `weekly_goals` server actions so the SAME
 * table drives weekly goals (keeping the commit/approve rituals + month link
 * that live on that engine). Title writes `target_done`; team + cascade fields
 * go through the goals-workspace weekly actions; %-done + archive reuse the
 * legacy weekly engine.
 */

import type { GoalTableActions, GoalTableActionRes } from "@/components/goals/board/goal-table-view";
import {
  updateWeeklyCascadeFields,
  setWeeklyTitle,
  setWeeklyTeamInvolved,
} from "@/app/(app)/goals/weekly/actions";
import {
  setWeeklyGoalPct,
  archiveWeeklyGoal,
  bulkPutWeeklyGoalsInArchive,
} from "@/app/(app)/weekly-goals/actions";
import { setWeeklyGoalInitiatorStatus } from "@/app/(app)/goals/initiator-actions";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const WEEKLY_TABLE_ACTIONS: GoalTableActions = {
  /**
   * ONE PAYLOAD, THREE WRITERS — and no early return.
   *
   * Weekly's fields live behind three different server actions (the title is a
   * column of its own, team members are JSON with their own validation, the
   * rest are the additive cascade columns), so this fans one patch out across
   * them and stops at the first failure.
   *
   * It used to `return` on the first key it recognised, which was correct while
   * the only caller was an inline cell (always exactly one field). The Edit
   * DIALOG sends the whole row at once — title AND area AND target AND notes —
   * and against that shape an early return saved the title and silently dropped
   * everything else, reporting success. Hence: match every group present.
   */
  async editGoal(input) {
    const id = input.id;

    // Goal title → target_done.
    if ("title" in input && typeof input.title === "string") {
      const res = await setWeeklyTitle({ id, title: input.title });
      if (!res.ok) return res;
    }
    // Team members (weekly stores employeeId/name; weights aren't persisted here).
    if ("teamInvolved" in input) {
      const team = (input.teamInvolved as Array<{ employeeId?: string; name?: string }> | null) ?? [];
      const res = await setWeeklyTeamInvolved({
        id,
        members: team.map((m) => ({ employeeId: m.employeeId, name: m.name })),
      });
      if (!res.ok) return res;
    }
    // Additive cascade fields — full column parity with Y/Q/M: area / measure /
    // target / actual / team-dependency / weight / type / status / reviewer /
    // share / delegated (all real weekly_goals columns).
    const fields: Record<string, unknown> = {};
    if ("area" in input) fields.area = (input.area as string | null) ?? null;
    if ("uom" in input) fields.uom = (input.uom as string | null) ?? null;
    if ("targetQty" in input) fields.targetQty = toNum(input.targetQty);
    if ("actualQty" in input) fields.actualQty = toNum(input.actualQty);
    if ("teamDependencyPct" in input) fields.teamDependencyPct = (input.teamDependencyPct as number | null) ?? null;
    if ("weight" in input) fields.weight = input.weight;
    if ("goalType" in input) fields.goalType = (input.goalType as string | null) ?? null;
    if ("status" in input) fields.status = input.status;
    if ("reviewedById" in input) fields.reviewedById = (input.reviewedById as string | null) ?? null;
    if ("shareWithTeam" in input) fields.shareWithTeam = input.shareWithTeam;
    if ("delegatedTo" in input) fields.delegatedTo = (input.delegatedTo as unknown) ?? null;
    // The NOTES column and the dialog's Notes box (a real weekly_goals column).
    if ("notes" in input) fields.notes = (input.notes as string | null) ?? null;
    // `targetAmount` / `actualAmount` — the money twins of the qty pair, sent by
    // the edit dialog and accepted by updateWeeklyCascadeFields.
    if ("targetAmount" in input) fields.targetAmount = toNum(input.targetAmount);
    if ("actualAmount" in input) fields.actualAmount = toNum(input.actualAmount);
    if (Object.keys(fields).length > 0) {
      return updateWeeklyCascadeFields({ id, ...fields } as Parameters<typeof updateWeeklyCascadeFields>[0]);
    }
    // category (legacy free-text tag) and targetDate (month-only) aren't weekly
    // columns — nothing left to write.
    return { ok: true } as GoalTableActionRes;
  },
  setGoalPctDone(input) {
    return setWeeklyGoalPct({ id: input.id, pctDone: input.pctDone });
  },
  archiveGoal(input) {
    return archiveWeeklyGoal({ id: input.id, archived: true });
  },
  async bulkArchiveGoals(input) {
    for (const id of input.ids) {
      const res = await archiveWeeklyGoal({ id, archived: true });
      if (!res.ok) return res;
    }
    return { ok: true } as GoalTableActionRes;
  },
  // ARCHIVE (migration 0215) — "put away", the button beside Delete. Distinct
  // from bulkArchiveGoals above, which despite its name is this module's DELETE
  // (it sets `archived` and the row lands in the Recycle Bin). Stamping
  // `archived_at` instead takes the goal off the board and files it under
  // Archive › Goals in its own "Archived weekly goals" table.
  bulkPutInArchive: (input) => bulkPutWeeklyGoalsInArchive(input),
  // THE VERDICT GOES TO `weekly_goals`. The table's cell used to call the
  // CASCADE action directly, which looked a weekly id up in `goals` and failed
  // with "Goal not found." every time — so the column was unusable on this
  // board even though the columns behind it have existed since migration 0225.
  setInitiatorStatus: (input) => setWeeklyGoalInitiatorStatus(input.id, input.next),
};
