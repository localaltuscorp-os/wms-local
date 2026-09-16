"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveTargets } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canViewModule } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { withRetry } from "@/lib/db/with-timeout";
import {
  PERIOD_KINDS,
  addMonths,
  currentMonthKey,
  formatMonthKey,
} from "@/lib/incentive/analytics/periods";
import type { IncentiveAnalytics } from "@/lib/incentive/analytics/model";
import { loadIncentiveAnalytics } from "@/lib/queries/incentive-analytics";

/**
 * INCENTIVE DASHBOARD — server actions.
 *
 * The browser sends a PERIOD and nothing else. Who is asking, what they may see
 * and the CTC figures are all resolved here on every call, so a crafted request
 * cannot name another employee or widen its own scope — there is no parameter
 * to widen.
 */

const MODULE = "employees.incentive";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const PeriodInput = z
  .object({
    kind: z.enum(PERIOD_KINDS),
    month: z.string().max(7).nullable().optional(),
  })
  .strict();

export async function fetchIncentiveAnalytics(input: {
  kind: (typeof PERIOD_KINDS)[number];
  month?: string | null;
}): Promise<Result<{ data: IncentiveAnalytics }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = PeriodInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid period." };

  try {
    const data = await withRetry(() => loadIncentiveAnalytics(me, parsed.data), {
      attempts: 2,
      timeoutMs: [9000, 14000],
      label: "incentive:analytics",
    });
    if (!data) return { ok: false, error: "Choose a month between Jan 2020 and this month." };
    return { ok: true, data };
  } catch (err) {
    // A database that does not answer in time must come back as a message the
    // dashboard can show — not a thrown 500 that leaves the view frozen on the
    // previous period with no explanation.
    console.error("[incentive/analytics] load failed", err);
    return { ok: false, error: "The incentive dashboard couldn't load just now — please try again." };
  }
}

const TargetInput = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month."),
    amount: z
      .number({ message: "Enter the target amount." })
      .finite("Enter the target amount.")
      .positive("A target must be more than ₹0.")
      .max(1_000_000_000, "That target is too large."),
  })
  .strict();

/**
 * Fill in MY OWN missing incentive target — the action behind the dashboard's
 * red warning bar.
 *
 * It writes the existing `incentive_targets` row, the same table and shape the
 * admin Targets tab writes; there is no second target store. Deliberately
 * narrow:
 *  · only for the signed-in employee (name and id come from the session);
 *  · only for the current or the next month (IST);
 *  · only when no target exists yet — changing a target someone has already
 *    set stays with an admin on the Targets tab, so the warning cannot be used
 *    to lower a target after the fact.
 */
export async function setMyIncentiveTarget(input: {
  month: string;
  amount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) {
    return { ok: false, error: "You don't have access to the Incentive module." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = TargetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid target." };
  const { month, amount } = parsed.data;

  const current = currentMonthKey();
  const next = addMonths(current, 1);
  if (month !== current && month !== next) {
    return { ok: false, error: "You can only fill in this month's or next month's target." };
  }

  const periodMonth = `${month}-01`;
  const alreadySet = {
    ok: false as const,
    error: `Your target for ${formatMonthKey(month)} is already set — ask an admin if it needs to change.`,
  };

  const existing = await db
    .select({ id: incentiveTargets.id })
    .from(incentiveTargets)
    .where(
      and(
        eq(incentiveTargets.periodMonth, periodMonth),
        or(
          eq(incentiveTargets.employeeId, me.id),
          sql`lower(trim(${incentiveTargets.empName})) = lower(trim(${me.name}))`,
        ),
      ),
    )
    .limit(1);
  if (existing.length > 0) return alreadySet;

  const inserted = await db
    .insert(incentiveTargets)
    .values({
      empName: me.name.trim(),
      employeeId: me.id,
      periodMonth,
      targetAmount: amount.toFixed(2),
      note: "Entered by the employee from the Incentive Dashboard",
    })
    .onConflictDoNothing()
    .returning({ id: incentiveTargets.id });
  if (inserted.length === 0) return alreadySet;

  revalidatePath("/incentive");
  return { ok: true };
}
