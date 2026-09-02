"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, dailyChecklistReviews } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canReviewChecklist } from "@/lib/queries/checklist-review";

type Result = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  employeeId: z.string().uuid(),
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["reviewed", "approved", "needs_rework"]),
  note: z.string().max(1000).optional(),
});

/** Record (or update) a manager's review of a team member's day. One row per
 *  (employee, day). Only a manager of that employee (or an admin) may review. */
export async function reviewChecklistDay(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const allowed = await canReviewChecklist({ id: me.id, isAdmin: me.isAdmin, email: me.email }, parsed.data.employeeId);
  if (!allowed) return { ok: false, error: "You can only review your own team members." };

  try {
    await db
      .insert(dailyChecklistReviews)
      .values({
        employeeId: parsed.data.employeeId,
        planDate: parsed.data.planDate,
        reviewerId: me.id,
        status: parsed.data.status,
        note: parsed.data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [dailyChecklistReviews.employeeId, dailyChecklistReviews.planDate],
        set: {
          reviewerId: me.id,
          status: parsed.data.status,
          note: parsed.data.note?.trim() || null,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    return { ok: false, error: `Could not save review: ${(err as Error).message}` };
  }
  revalidatePath(`/goals/weekly/team/${parsed.data.employeeId}`);
  return { ok: true };
}
