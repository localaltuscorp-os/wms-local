"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { assertSuperAdmin, APPROVAL_KINDS, decideCompensationApproval } from "@/lib/compensation/workflow";

const Schema = z.object({
  kind: z.enum(APPROVAL_KINDS), subjectId: z.string().uuid(), employeeId: z.string().uuid(),
  periodMonth: z.string().nullable(), amount: z.number().finite().min(0),
  status: z.enum(["approved", "rejected"]), note: z.string().max(800).optional(),
}).strict();

export async function decideApproval(input: z.infer<typeof Schema>) {
  const me = await requireUser();
  if (!assertSuperAdmin(me.email)) return { ok: false as const, error: "Only super-admins can approve compensation items." };
  const parsed = Schema.safeParse(input); if (!parsed.success) return { ok: false as const, error: "Invalid approval request." };
  const result = await decideCompensationApproval({ ...parsed.data, actorId: me.id });
  if (result.ok) { revalidatePath("/admin/approvals"); revalidatePath("/accounts/approvals"); }
  return result;
}
