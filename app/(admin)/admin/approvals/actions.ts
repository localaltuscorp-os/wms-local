"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { canDecideCompensation, APPROVAL_KINDS, decideCompensationApproval } from "@/lib/compensation/workflow";
import { db } from "@/lib/db";
import { onboardingApprovals, onboardingSubmissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { recordIncentiveDecision } from "@/lib/incentive/workflow-server";
import { notifyIncentiveDecision } from "@/lib/incentive/notifications/service";
import { afterResponse } from "@/lib/after";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

const Schema = z.object({
  kind: z.enum(APPROVAL_KINDS), subjectId: z.string().uuid(), employeeId: z.string().uuid(),
  periodMonth: z.string().nullable(), amount: z.number().finite().min(0),
  status: z.enum(["approved", "rejected"]), note: z.string().max(800).optional(), edit: z.boolean().optional(),
}).strict();

const OnboardingSchema = z.object({
  submissionId: z.string().uuid(),
  employeeId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  note: z.string().max(800).optional(),
}).strict();

export async function decideApproval(input: z.infer<typeof Schema>) {
  const me = await requireUser();
  const parsed = Schema.safeParse(input); if (!parsed.success) return { ok: false as const, error: "Invalid approval request." };
  const { edit = false, ...decisionInput } = parsed.data;
  if (!(await canDecideCompensation(me))) {
    return { ok: false as const, error: "Only Super Admins can record compensation decisions." };
  }
  if (edit && !DUMMY_MODE) return { ok: false as const, error: "Editing a recorded decision is available only in local dummy mode." };
  if (decisionInput.kind === "incentive" && !edit) {
    const decision = await recordIncentiveDecision({
      requestId: decisionInput.subjectId,
      action: decisionInput.status === "approved" ? "approve" : "not_approve",
      note: decisionInput.note ?? null,
      reviewerId: me.id,
    });
    if (!decision.ok) return decision;
    afterResponse(() => notifyIncentiveDecision(decision));
  }
  const result = await decideCompensationApproval({ ...decisionInput, actorId: me.id, allowExistingDecision: decisionInput.kind === "incentive" || edit });
  if (result.ok) { revalidatePath("/admin/approvals"); revalidatePath("/accounts/approvals"); revalidatePath("/incentive"); }
  return result;
}

/** Record a Super Admin review for a submitted onboarding form. The approval is
 * deliberately separate from onboarding completion, which already unlocks the
 * existing employee-provisioning workflow. */
export async function decideOnboardingApproval(input: z.infer<typeof OnboardingSchema>) {
  const me = await requireUser();
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid onboarding approval request." };
  if (!(await canDecideCompensation(me))) return { ok: false as const, error: "Only Super Admins can record onboarding decisions." };

  const decisionNote = parsed.data.note?.trim() || null;
  if (parsed.data.status === "rejected" && !decisionNote) return { ok: false as const, error: "A reason for rejection is required." };
  const [source] = await db.select({ id: onboardingSubmissions.id, employeeId: onboardingSubmissions.employeeId })
    .from(onboardingSubmissions)
    .where(and(eq(onboardingSubmissions.id, parsed.data.submissionId), eq(onboardingSubmissions.employeeId, parsed.data.employeeId), eq(onboardingSubmissions.status, "submitted")))
    .limit(1);
  if (!source) return { ok: false as const, error: "Submitted onboarding form was not found." };

  const [existing] = await db.select({ status: onboardingApprovals.status })
    .from(onboardingApprovals)
    .where(eq(onboardingApprovals.submissionId, source.id))
    .limit(1);
  if (existing && !DUMMY_MODE) return { ok: false as const, error: "This onboarding form has already received a decision." };

  const now = new Date();
  await db.insert(onboardingApprovals).values({
    submissionId: source.id,
    employeeId: source.employeeId,
    status: parsed.data.status,
    decisionNote,
    decidedById: me.id,
    decidedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: onboardingApprovals.submissionId,
    set: { status: parsed.data.status, decisionNote, decidedById: me.id, decidedAt: now, updatedAt: now },
  });
  revalidatePath("/admin/approvals");
  return { ok: true as const };
}
