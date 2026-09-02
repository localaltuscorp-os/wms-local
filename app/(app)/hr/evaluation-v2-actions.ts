"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, evaluationWeightProfiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  DESIGNATION_LADDER,
  DEFAULT_SECTION_WEIGHTS,
  RATING_SECTIONS,
  emptyInstance,
  type EvaluationInstance,
  type EvaluationV2,
  type EvaluatorRole,
  type OverrideEvent,
} from "@/lib/hr/candidate/evaluation-v2";
import type { EvaluationV2Load, WeightProfileRow } from "./evaluation-v2-actions-types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
type VoidResult = { ok: true } | { ok: false; error: string };

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const otherRoleOf = (r: EvaluatorRole): EvaluatorRole => (r === "interviewer" ? "management" : "interviewer");

/** Merge a designation's stored weights over the seeded default over the code default. */
function resolveWeights(
  designationWeights: Record<string, number> | undefined,
  defaultRow: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of RATING_SECTIONS) {
    const v =
      designationWeights?.[s.id] ??
      defaultRow?.[s.id] ??
      DEFAULT_SECTION_WEIGHTS[s.id] ??
      0;
    out[s.id] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return out;
}

/** Load a candidate's evaluation instance for `role`, the other role's instance,
 *  and the resolved per-designation weight profiles. */
export async function getEvaluationV2(
  candidateId: string,
  role: EvaluatorRole,
): Promise<Result<{ load: EvaluationV2Load }>> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid candidate." };
  if (role !== "interviewer" && role !== "management") return { ok: false, error: "Invalid role." };

  try {
    const [cand] = await db
      .select({ evaluationV2: candidateIntake.evaluationV2, positionApplied: candidateIntake.positionApplied })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, candidateId))
      .limit(1);

    const blob = (cand?.evaluationV2 ?? {}) as EvaluationV2;
    const instance = blob[role] ?? emptyInstance();
    const other = blob[otherRoleOf(role)] ?? null;

    const rows = (await db
      .select({ designation: evaluationWeightProfiles.designation, weights: evaluationWeightProfiles.weights })
      .from(evaluationWeightProfiles)) as WeightProfileRow[];
    const byDes = new Map(rows.map((r) => [r.designation, r.weights]));
    const defaultRow = byDes.get("default");

    const profilesByDesignation: Record<string, Record<string, number>> = {
      default: resolveWeights(defaultRow, defaultRow),
    };
    for (const d of DESIGNATION_LADDER) {
      profilesByDesignation[d] = resolveWeights(byDes.get(d), defaultRow);
    }

    // Best-guess designation from the applied position (loose match), else default.
    const applied = (cand?.positionApplied ?? "").toLowerCase();
    const suggested =
      DESIGNATION_LADDER.find((d) => applied.includes(d.toLowerCase())) ?? "default";

    return {
      ok: true,
      load: {
        instance,
        other,
        otherRole: otherRoleOf(role),
        profilesByDesignation,
        designations: [...DESIGNATION_LADDER],
        suggestedDesignation: suggested,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the evaluation." };
  }
}

/** Persist an evaluation instance for `role`, merging beside the other role's. */
export async function saveEvaluationV2(
  candidateId: string,
  role: EvaluatorRole,
  instance: EvaluationInstance,
): Promise<VoidResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid candidate." };
  if (role !== "interviewer" && role !== "management") return { ok: false, error: "Invalid role." };

  try {
    const [cand] = await db
      .select({ evaluationV2: candidateIntake.evaluationV2 })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, candidateId))
      .limit(1);
    if (!cand) return { ok: false, error: "Candidate not found." };

    // Stamp the acting employee on any override events missing an actor id.
    const stamp = (ev: OverrideEvent | null | undefined): OverrideEvent | null | undefined =>
      ev ? { ...ev, by: ev.by || me.id } : ev;
    const stamped: EvaluationInstance = {
      ...instance,
      recommendationOverride: stamp(instance.recommendationOverride) ?? null,
      overrideHistory: (instance.overrideHistory ?? []).map((ev) => stamp(ev)!).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };

    const blob = (cand.evaluationV2 ?? {}) as EvaluationV2;
    const next: EvaluationV2 = { ...blob, [role]: stamped };
    await db
      .update(candidateIntake)
      .set({ evaluationV2: next, updatedAt: new Date() })
      .where(eq(candidateIntake.id, candidateId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the evaluation." };
  }
}

/** Super-admin: every stored weight-profile row (for the matrix editor). */
export async function listWeightProfiles(): Promise<Result<{ rows: WeightProfileRow[] }>> {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return { ok: false, error: "Super-admin only." };
  try {
    const rows = (await db
      .select({ designation: evaluationWeightProfiles.designation, weights: evaluationWeightProfiles.weights })
      .from(evaluationWeightProfiles)) as WeightProfileRow[];
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load profiles." };
  }
}

/** Super-admin: upsert one designation's weight profile. */
export async function saveWeightProfile(
  designation: string,
  weights: Record<string, number>,
): Promise<VoidResult> {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return { ok: false, error: "Super-admin only." };
  const valid = designation === "default" || (DESIGNATION_LADDER as readonly string[]).includes(designation);
  if (!valid) return { ok: false, error: "Unknown designation." };

  // Clean the weights to known sections, non-negative numbers only.
  const clean: Record<string, number> = {};
  for (const s of RATING_SECTIONS) {
    const v = weights?.[s.id];
    clean[s.id] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  }

  try {
    await db
      .insert(evaluationWeightProfiles)
      .values({ designation, weights: clean, updatedById: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: evaluationWeightProfiles.designation,
        set: { weights: clean, updatedById: me.id, updatedAt: new Date() },
      });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the profile." };
  }
}
