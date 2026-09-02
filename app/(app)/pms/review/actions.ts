"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, pmsMonthlyReview, pmsPersonalGoal } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  reviewablePeople,
  flattenReviewable,
  REVIEW_CHANGE_TAGS,
  type ReviewRelation,
} from "@/lib/queries/pms-review";

const PATH = "/pms/review";

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const tagSet = new Set<string>(REVIEW_CHANGE_TAGS);

const SaveReviewSchema = z.object({
  subjectId: z.string().uuid("Pick a person to review."),
  relation: z.enum(["manager", "subordinate", "peer"]),
  period: z.string().regex(PERIOD_RE, "Invalid period."),
  // The review scale is constrained 3..5 by policy (§4).
  attitude: z.number().int().min(3).max(5),
  behaviour: z.number().int().min(3).max(5),
  skill: z.number().int().min(3).max(5),
  changeTags: z.array(z.string()).max(8).default([]),
  explanation: z.string().trim().max(2000).optional().default(""),
  scope: z.enum(["internal", "external"]),
});

/**
 * Upsert the signed-in user's monthly 360 review of a subject. Re-checks that
 * the reviewer is actually allowed the claimed relation toward the subject
 * (downline → manager, own manager → subordinate, same-manager → peer) so the
 * client can never widen scope. Ratings are clamped to 3..5 by the schema.
 */
export async function saveMonthlyReview(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Authorisation: the claimed (subject, relation) must be in my allow-list.
  const scope = await reviewablePeople({ id: me.id, managerId: me.managerId });
  const allowed = flattenReviewable(scope);
  const allowedRelation = allowed.get(d.subjectId);
  if (!allowedRelation) {
    return { ok: false, error: "You're not allowed to review this person." };
  }
  if (allowedRelation !== (d.relation as ReviewRelation)) {
    return { ok: false, error: `You can only review this person as their ${allowedRelation}.` };
  }

  // Sanitise tags to the known vocabulary (free-text explanation carries the rest).
  const cleanTags = Array.from(new Set(d.changeTags.filter((t) => tagSet.has(t))));

  try {
    await db
      .insert(pmsMonthlyReview)
      .values({
        subjectId: d.subjectId,
        reviewerId: me.id,
        relation: d.relation,
        period: d.period,
        attitude: d.attitude,
        behaviour: d.behaviour,
        skill: d.skill,
        changeTags: cleanTags,
        explanation: d.explanation || null,
        scope: d.scope,
      })
      .onConflictDoUpdate({
        target: [
          pmsMonthlyReview.subjectId,
          pmsMonthlyReview.reviewerId,
          pmsMonthlyReview.relation,
          pmsMonthlyReview.period,
        ],
        set: {
          attitude: d.attitude,
          behaviour: d.behaviour,
          skill: d.skill,
          changeTags: cleanTags,
          explanation: d.explanation || null,
          scope: d.scope,
          updatedAt: new Date(),
        },
      });
  } catch {
    return { ok: false, error: "Couldn't save the review. Please try again." };
  }

  revalidatePath(PATH);
  revalidatePath("/pms");
  return { ok: true };
}

const GoalInput = z.object({
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(1000).optional().default(""),
  status: z.enum(["active", "done", "dropped"]).default("active"),
});

const SaveGoalsSchema = z.object({
  period: z.string().regex(PERIOD_RE, "Invalid period."),
  goals: z.array(GoalInput).max(3, "You can set at most 3 personal goals."),
});

/**
 * Replace the signed-in user's up-to-3 Personal (non-work) goals for a period.
 * Always operates on the user's OWN goals only — there is no subject parameter.
 * Empty-title rows are dropped client-side; we re-validate and cap at 3 here.
 */
export async function savePersonalGoals(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveGoalsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { period, goals } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // Snapshot → replace: simplest correct model for a fixed 3-slot list.
      await tx
        .delete(pmsPersonalGoal)
        .where(and(eq(pmsPersonalGoal.employeeId, me.id), eq(pmsPersonalGoal.period, period)));
      if (goals.length > 0) {
        await tx.insert(pmsPersonalGoal).values(
          goals.map((g, i) => ({
            employeeId: me.id,
            period,
            title: g.title,
            detail: g.detail || null,
            status: g.status,
            position: i,
          })),
        );
      }
    });
  } catch {
    return { ok: false, error: "Couldn't save your goals. Please try again." };
  }

  revalidatePath(PATH);
  return { ok: true };
}
