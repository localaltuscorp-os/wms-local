"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveEntries, incentivePayoutEvents, salaryPayments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { planEntryReversal } from "@/lib/incentive/reversal";
import { round2 } from "@/lib/incentive/payout-math";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const money2 = (n: number): string => round2(n).toFixed(2);

function todayIstIso(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const Schema = z
  .object({
    id: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

/**
 * WS-6 — reverse a paid incentive ENTRY (financial reversal).
 *
 * Inside ONE transaction:
 *   1. re-read the entry FOR UPDATE (serialises a concurrent reverse/payout),
 *   2. plan the adjustment — negative of the PAID amount, nothing if unpaid,
 *   3. if a reversal adjustment is due, write a NEGATIVE `salary_payments` row
 *      (method='reversal') + an `incentive_payout_events` audit row,
 *   4. mark the entry `reversed` — the duplicate guard.
 *
 * The original paid amount is preserved (historical record); the negative row
 * offsets the employee's payable. A repeat reversal sees `reversed=true` and
 * writes nothing, so it can never double-adjust. Admin-only + rate-limited.
 */
export async function reverseIncentiveEntry(
  input: unknown,
): Promise<ActionResult<{ reversalAmount: number; skipped: boolean }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(incentiveEntries)
        .where(eq(incentiveEntries.id, v.id))
        .for("update");
      if (!entry) return { kind: "err" as const, error: "Incentive entry not found." };

      const plan = planEntryReversal(Number(entry.paidAmt), entry.reversed);
      if (plan.alreadyReversed) return { kind: "ok" as const, reversalAmount: 0, skipped: true };

      const paidDate = todayIstIso();
      const month = entry.periodMonth ? String(entry.periodMonth).slice(0, 7) : null;

      if (plan.shouldReverse) {
        // Audit spine row — the reversal event (negative amount).
        await tx.insert(incentivePayoutEvents).values({
          employeeId: entry.employeeId,
          empName: entry.empName,
          source: "entry",
          sourceId: entry.id,
          salaryRunId: entry.payoutRunId,
          periodMonth: entry.periodMonth,
          amount: money2(plan.reversalAmount),
          paidDate,
          createdById: me.id,
          note:
            ["negative payable adjustment", v.note ?? null].filter(Boolean).join(" · ") ||
            "negative payable adjustment",
        });

        // The negative payable — offsets the original positive payment row.
        await tx.insert(salaryPayments).values({
          employeeId: entry.employeeId,
          salaryRunId: entry.payoutRunId,
          month,
          kind: "incentive",
          incentiveEntryId: entry.id,
          amount: money2(plan.reversalAmount),
          paidDate,
          method: "reversal",
          note: v.note ?? null,
          createdById: me.id,
        });
      }

      await tx
        .update(incentiveEntries)
        .set({
          reversed: true,
          reversedAt: new Date(),
          reversedById: me.id,
          updatedAt: new Date(),
        })
        .where(eq(incentiveEntries.id, v.id));

      return { kind: "ok" as const, reversalAmount: plan.reversalAmount, skipped: false };
    });

    if (result.kind === "err") return { ok: false, error: result.error };

    revalidatePath("/salary/incentive-payout");
    revalidatePath("/salary");
    revalidatePath("/incentive");
    return { ok: true, reversalAmount: result.reversalAmount, skipped: result.skipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}
