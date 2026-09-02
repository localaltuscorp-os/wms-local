"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  DESIGNATION_LADDER,
  emptyInstance,
  type EvaluationV2,
  type EvaluatorRole,
  type InterviewAiInsights,
} from "@/lib/hr/candidate/evaluation-v2";
import { generateInterviewInsights as generateInsightsCore } from "@/lib/ai/interview-insights";

/**
 * INTERVIEW INTELLIGENCE — server action wrapping the AI insights engine.
 *
 * Loads a candidate's evaluation-v2 instance for the requested role (mirrors
 * getEvaluationV2 in evaluation-v2-actions.ts), resolves the applied
 * position / designation, decides whether it's a sales role, and delegates to
 * the load-neutral lib core. The core NEVER throws (LLM → heuristic fallback);
 * this action only guards auth / input / DB.
 *
 * NOTE: the lib core and this action share the name `generateInterviewInsights`
 * but live in different modules. The UI imports THIS one from
 * "@/app/(app)/hr/interview-insights-actions".
 */

type Result =
  | { ok: true; insights: InterviewAiInsights }
  | { ok: false; error: string };

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Keyword-match a sales / customer-facing role from the position + designation. */
function isSalesRoleFrom(...fields: string[]): boolean {
  const hay = fields.join(" ").toLowerCase();
  return (
    hay.includes("sales") ||
    hay.includes("business development") ||
    /\bbd\b/.test(hay)
  );
}

export async function generateInterviewInsights(
  candidateId: string,
  role: EvaluatorRole,
): Promise<Result> {
  const me = await requireUser();
  // AI generation hits an external service — rate-limit it as a write.
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid candidate." };
  if (role !== "interviewer" && role !== "management") {
    return { ok: false, error: "Invalid role." };
  }

  try {
    const [cand] = await db
      .select({
        evaluationV2: candidateIntake.evaluationV2,
        positionApplied: candidateIntake.positionApplied,
      })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, candidateId))
      .limit(1);
    if (!cand) return { ok: false, error: "Candidate not found." };

    const blob = (cand.evaluationV2 ?? {}) as EvaluationV2;
    const instance = blob[role] ?? emptyInstance();

    const positionApplied = (cand.positionApplied ?? "").trim();
    // Best-guess designation from the applied position (loose ladder match).
    const applied = positionApplied.toLowerCase();
    const designation =
      DESIGNATION_LADDER.find((d) => applied.includes(d.toLowerCase())) ?? "";
    const isSalesRole = isSalesRoleFrom(positionApplied, designation);

    const insights = await generateInsightsCore({
      positionApplied,
      designation,
      instance,
      isSalesRole,
    });
    return { ok: true, insights };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not generate insights.",
    };
  }
}
