"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { canDecideCompensation, APPROVAL_KINDS, decideCompensationApproval } from "@/lib/compensation/workflow";
import { recordIncentiveDecision } from "@/lib/incentive/workflow-server";
import { notifyIncentiveDecision } from "@/lib/incentive/notifications/service";
import { afterResponse } from "@/lib/after";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

const Schema = z.object({
  kind: z.enum(APPROVAL_KINDS), subjectId: z.string().uuid(), employeeId: z.string().uuid(),
  periodMonth: z.string().nullable(), amount: z.number().finite().min(0),
  status: z.enum(["approved", "rejected"]), note: z.string().max(800).optional(), edit: z.boolean().optional(),
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
