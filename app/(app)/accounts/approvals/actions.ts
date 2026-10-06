"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { afterResponse } from "@/lib/after";
import { APPROVAL_KINDS, isAccountsPayer, mailCompensationReceipt, markCompensationPaid, sendCompensationReceiptWhatsApp } from "@/lib/compensation/workflow";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

const Schema = z.object({ kind: z.enum(APPROVAL_KINDS), subjectId: z.string().uuid() }).strict();
export async function payApprovedCompensation(input: z.infer<typeof Schema>) {
  const me = await requireUser();
  if (!(DUMMY_MODE || await isAccountsPayer(me))) return { ok: false as const, error: "Only the Accounts department can record payments." };
  const parsed = Schema.safeParse(input); if (!parsed.success) return { ok: false as const, error: "Invalid payment request." };
  const result = await markCompensationPaid({ ...parsed.data, actorId: me.id });
  if (!result.ok) return result;
  const paidAt = new Date();
  afterResponse(() => Promise.allSettled([
    mailCompensationReceipt(result.row, paidAt),
    sendCompensationReceiptWhatsApp(result.row, paidAt),
  ]));
  revalidatePath("/accounts/approvals"); revalidatePath("/admin/approvals");
  return { ok: true as const };
}
