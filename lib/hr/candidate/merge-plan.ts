/**
 * DECIDING WHAT A CANDIDATE MERGE ACTUALLY WRITES.
 *
 * PURE — no db, no env, no server-only — so the one genuinely dangerous part of
 * a merge can be tested exhaustively without a database.
 *
 * ── WHY THIS IS ITS OWN MODULE ─────────────────────────────────────────────
 * It is called from `app/(app)/hr/candidate-merge-actions.ts`, which is a
 * `"use server"` module and may therefore only export async functions. Keeping
 * the decision here is what makes it reachable from a test at all.
 *
 * ── THE RULE IT ENCODES ────────────────────────────────────────────────────
 * The SURVIVOR always wins a tie. Merging exists because a placeholder — a name
 * and a phone number typed by somebody in a hurry — accumulated an evaluation
 * before the candidate had filled anything. The candidate's own row is the real
 * record: it owns their login, their access links, their signatures, and the
 * name they typed for themselves. So its answers are never overwritten by the
 * placeholder's.
 *
 * Skipped items are RETURNED rather than passed over, because "we kept the
 * assessment you had already filled in" is something the person merging needs to
 * be told — silently discarding one interviewer's work in favour of another's is
 * the worst outcome this operation can produce.
 */

/** The two assessment roles inside `evaluation_v2`. */
export const V2_ROLES = ["interviewer", "management"] as const;

export interface MergeInput {
  /** The placeholder being retired. */
  a: {
    evaluation?: unknown;
    evaluationV2?: unknown;
    managementAssessment?: unknown;
  };
  /** The candidate's own form row — the one that survives. */
  b: {
    evaluation?: unknown;
    evaluationV2?: unknown;
    managementAssessment?: unknown;
  };
}

export interface MergePlan {
  evaluationV2: Record<string, unknown>;
  evaluation: unknown;
  managementAssessment: unknown;
  /** Blob keys written onto the survivor, e.g. "evaluationV2:interviewer". */
  transferred: string[];
  /** Blob keys the survivor already had, so nothing was written. */
  skipped: string[];
}

/**
 * Work out exactly what the merge writes. Pure: same input, same output, no
 * writes, no reads.
 *
 * A source value of `null` and a source of `undefined` are both "the placeholder
 * has nothing here" — the blobs are nullable jsonb columns, and an absent role
 * inside `evaluation_v2` is simply not a key.
 */
export function planMerge(input: MergeInput): MergePlan {
  const { a, b } = input;

  const transferred: string[] = [];
  const skipped: string[] = [];

  // evaluation_v2 is keyed by ROLE, and the two roles are decided separately:
  // a placeholder may hold an interviewer pass while the candidate's row holds a
  // management one, and neither should clobber the other.
  const aV2 = (a.evaluationV2 ?? {}) as Record<string, unknown>;
  const evaluationV2: Record<string, unknown> = { ...((b.evaluationV2 ?? {}) as Record<string, unknown>) };

  for (const role of V2_ROLES) {
    const fromA = aV2[role];
    if (fromA == null) continue;
    if (evaluationV2[role] != null) {
      skipped.push(`evaluationV2:${role}`);
      continue;
    }
    evaluationV2[role] = fromA;
    transferred.push(`evaluationV2:${role}`);
  }

  // The two flat blobs are all-or-nothing: the survivor keeps its own, or takes
  // the placeholder's. A merge of two half-filled checklists was never a case
  // worth inventing a rule for, and picking one whole is the honest answer.
  const evaluation = b.evaluation ?? a.evaluation ?? null;
  if (a.evaluation != null) {
    if (b.evaluation != null) skipped.push("evaluation");
    else transferred.push("evaluation");
  }

  const managementAssessment = b.managementAssessment ?? a.managementAssessment ?? null;
  if (a.managementAssessment != null) {
    if (b.managementAssessment != null) skipped.push("managementAssessment");
    else transferred.push("managementAssessment");
  }

  return { evaluationV2, evaluation, managementAssessment, transferred, skipped };
}
