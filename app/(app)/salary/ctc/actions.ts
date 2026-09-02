"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CtcBreakupSchema,
  RetentionBonusSchema,
  AdjustmentSchema,
  DeleteAdjustmentSchema,
} from "@/lib/validators/salary-ctc";
import {
  upsertCtcBreakup,
  upsertRetentionBonus,
  insertAdjustment,
  deleteAdjustment,
} from "@/lib/queries/salary-ctc-store";

// WS-5 Salary core — server actions for the CTC breakup form, retention bonus,
// and accountant adjustments. Admin-only + rate-limited, matching salary/
// actions.ts. These WRITE to the new v2 tables (raw SQL in the store); they do
// NOT touch the live salary_runs / salary_breakup numbers.

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/salary/ctc";

function firstIssue(e: { issues: Array<{ message: string }> }): string {
  return e.issues[0]?.message ?? "Invalid input";
}

export async function saveCtcBreakup(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CtcBreakupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await upsertCtcBreakup({
      employeeId: parsed.data.employeeId,
      payingEntityId: parsed.data.payingEntityId ?? null,
      annualCtc: parsed.data.annualCtc,
      components: parsed.data.components,
      updatedById: me.id,
    });
  } catch (err: unknown) {
    return { ok: false, error: dbError(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function saveRetentionBonus(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RetentionBonusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await upsertRetentionBonus({
      employeeId: parsed.data.employeeId,
      amount: parsed.data.amount,
      payableDate: parsed.data.payableDate ?? null,
      paid: parsed.data.paid,
      paidDate: parsed.data.paidDate ?? null,
      note: parsed.data.note ?? null,
      updatedById: me.id,
    });
  } catch (err: unknown) {
    return { ok: false, error: dbError(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function addAdjustment(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await insertAdjustment({
      employeeId: parsed.data.employeeId,
      month: parsed.data.month,
      kind: parsed.data.kind,
      days: parsed.data.days,
      reason: parsed.data.reason,
      createdById: me.id,
    });
  } catch (err: unknown) {
    return { ok: false, error: dbError(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeAdjustment(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DeleteAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await deleteAdjustment(parsed.data.id);
  } catch (err: unknown) {
    return { ok: false, error: dbError(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

function dbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Friendly hint when the v2 tables aren't applied yet.
  if (/relation .* does not exist|undefined table/i.test(msg)) {
    return "Salary v2 tables aren't applied yet — run the INTEGRATION NOTE DDL first.";
  }
  return `DB: ${msg}`;
}
