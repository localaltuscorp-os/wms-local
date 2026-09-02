"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, pmsScoreConfig } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";

type ActionResult = { ok: true } | { ok: false; error: string };

const num = z.coerce.number().finite();
const SaveSchema = z.object({
  weights: z.object({
    kpi: num, skillUpgrade: num, compliance: num, attitude: num, teamwork: num,
  }),
  thresholds: z.object({
    promotionScore: num, recognitionScore: num, minTenureDays: num,
    trainGiveHoursPerMonth: num, trainAttendHoursPerMonth: num, selfLearnHoursPerMonth: num,
    shareMinPerWeek: num, assessmentPassPct: num, noScheduleAlertDays: num,
    noAttendPromptDays: num, maxSessionMinutes: num, lateGraceDays: num, onTimeRateFloor: num,
  }),
  formula: z.object({
    kpiWeeklyWeight: num, kpiIncentiveWeight: num, skillAttendWeight: num, skillGiveWeight: num,
    skillSelfLearnWeight: num, skillShareWeight: num, compDccWeight: num, compChecklistWeight: num,
    ratingFloor: num, ratingCeil: num,
  }),
});

/**
 * Save the singleton PMS score config — THE source of all PMS policy (no weight
 * or threshold is ever hardcoded). Admin/super-admin only. Takes effect on the
 * next score read (the engines read this row at call time — no deploy needed).
 */
export async function saveScoreConfig(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only an admin can change the scoring policy." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  }
  try {
    await db
      .insert(pmsScoreConfig)
      .values({
        id: "default",
        weights: parsed.data.weights,
        thresholds: parsed.data.thresholds,
        formula: parsed.data.formula,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pmsScoreConfig.id,
        set: {
          weights: parsed.data.weights,
          thresholds: parsed.data.thresholds,
          formula: parsed.data.formula,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms");
  revalidatePath("/pms/config");
  return { ok: true };
}
