"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { EVAL_CATEGORIES } from "@/lib/hr/candidate/evaluation-checklist";
import {
  equalWeights,
  normalizeWeights,
  sumTo100,
  type EvaluationWeights,
} from "@/lib/hr/candidate/evaluation-weights";

/**
 * Server read + save for the super-admin-set Candidate-Evaluation section
 * weights, persisted on the single-row org_settings (id = 1). Kept out of the
 * client-safe pure module (evaluation-weights.ts) because it touches @/lib/db.
 *
 * Uses raw SQL for the jsonb column so it stays independent of the shared drizzle
 * schema map — and so a read gracefully falls back to EQUAL weights if the
 * `evaluation_weights` column hasn't been migrated in yet (0163).
 */

/**
 * The effective section weights: the saved super-admin blob if present and valid
 * (totals 100), otherwise EQUAL weights across the eight sections. Never throws.
 */
export async function getEvaluationWeights(): Promise<EvaluationWeights> {
  try {
    const rows = (await db.execute(
      sql`select evaluation_weights as w from org_settings where id = 1 limit 1`,
    )) as unknown as { w: unknown }[];
    const raw = rows[0]?.w;
    if (raw && typeof raw === "object") {
      const norm = normalizeWeights(raw as Record<string, unknown>);
      if (sumTo100(norm)) return norm;
    }
  } catch {
    /* column missing (pre-0163) or a transient blip — fall back to equal */
  }
  return equalWeights();
}

const WeightsSchema = z.record(
  z.string().max(60),
  z.number().finite().min(0).max(100),
);

/**
 * Save the per-section weights. SUPER-ADMIN ONLY. Validates that every weight is
 * ≥ 0 and the eight sections total exactly 100 before writing to
 * org_settings.evaluation_weights.
 */
export async function setEvaluationWeights(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireHrStaff();
  if (!isSuperAdmin(me.email)) return { ok: false, error: "Only a super-admin can change section weights." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = WeightsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Weights must each be a number between 0 and 100." };

  // Normalise to exactly the eight known sections, then enforce the total.
  const clean = normalizeWeights(parsed.data);
  if (Object.keys(parsed.data).some((k) => !EVAL_CATEGORIES.find((c) => c.id === k))) {
    return { ok: false, error: "Unknown evaluation section." };
  }
  if (!sumTo100(clean)) return { ok: false, error: "Section weights must total exactly 100." };

  try {
    await db.execute(sql`
      update org_settings
      set evaluation_weights = ${JSON.stringify(clean)}::jsonb, updated_at = now()
      where id = 1
    `);
    revalidatePath("/hr/evaluation");
    revalidatePath("/hr/management-assessment");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the weights." };
  }
}
