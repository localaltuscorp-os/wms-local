"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, goalApproverStatuses, weeklyGoals, weeklyGoalApproverStatuses } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { rateLimitOrError } from "@/lib/rate-limit";
import { approverStored, canSetApproverStatus, isApproverChoice } from "@/lib/status/approver-status";

/**
 * Set a goal's Approver / Initiator Status — Yearly, Quarterly and Monthly goals
 * (`goals`) and Weekly goals (`weekly_goals`) alike (account holder, 2026-09-15).
 *
 * WHO: the goal's initiator (`created_by_id`), the owner's manager (the owner is
 * in the viewer's downline) or an admin — the same people who may approve a
 * goal today (lib/goals/scope.ts `loadApprovableGoalRow`). The owner of a goal
 * somebody else raised is its doer and may not rule on it; a goal someone
 * raised for themselves is theirs to accept.
 */

const Input = z.object({
  kind: z.enum(["goal", "weekly"]),
  id: z.string().uuid(),
  choice: z.string(),
});

function isMissingTable(err: unknown): boolean {
  const code = (v: unknown) => (typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined);
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(err) === "42P01" || code(cause) === "42P01";
}

export async function setGoalApproverStatus(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { kind, id, choice } = parsed.data;
  if (!isApproverChoice(choice)) return { ok: false, error: "Unknown Approver / Initiator Status." };

  const [row] =
    kind === "goal"
      ? await db
          .select({ employeeId: goals.employeeId, createdById: goals.createdById, status: goals.status })
          .from(goals)
          .where(eq(goals.id, id))
          .limit(1)
      : await db
          .select({ employeeId: weeklyGoals.employeeId, createdById: weeklyGoals.createdById, status: weeklyGoals.status })
          .from(weeklyGoals)
          .where(eq(weeklyGoals.id, id))
          .limit(1);
  if (!row) return { ok: false, error: "Goal not found." };

  const admin = isAdmin || isSuperAdmin(me.email);
  const scope = admin ? { all: true, ids: [] as string[] } : await goalScopeFor({ id: me.id, isAdmin: false });
  const isInitiator = row.createdById != null && row.createdById === me.id;
  const verdict = canSetApproverStatus(
    {
      isAdmin: admin,
      isInitiator,
      isDoersManager: row.employeeId !== me.id && (scope.all || scope.ids.includes(row.employeeId)),
      isDoer: row.employeeId === me.id && !isInitiator,
    },
    choice,
    row.status,
  );
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const value = approverStored(choice);
  const now = new Date();
  try {
    if (kind === "goal") {
      if (value === null) {
        await db.delete(goalApproverStatuses).where(eq(goalApproverStatuses.goalId, id));
      } else {
        await db
          .insert(goalApproverStatuses)
          .values({ goalId: id, approvalStatus: value, setById: me.id, updatedAt: now })
          .onConflictDoUpdate({
            target: goalApproverStatuses.goalId,
            set: { approvalStatus: value, setById: me.id, updatedAt: now },
          });
      }
    } else if (value === null) {
      await db.delete(weeklyGoalApproverStatuses).where(eq(weeklyGoalApproverStatuses.weeklyGoalId, id));
    } else {
      await db
        .insert(weeklyGoalApproverStatuses)
        .values({ weeklyGoalId: id, approvalStatus: value, setById: me.id, updatedAt: now })
        .onConflictDoUpdate({
          target: weeklyGoalApproverStatuses.weeklyGoalId,
          set: { approvalStatus: value, setById: me.id, updatedAt: now },
        });
    }
  } catch (err) {
    if (isMissingTable(err)) {
      return { ok: false, error: "Approver / Initiator Status isn't set up yet — migration 0231 must be applied first." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }

  revalidatePath("/goals", "layout");
  return { ok: true };
}
