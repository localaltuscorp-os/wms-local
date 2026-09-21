"use server";

import { and, desc, eq, inArray, isNull, ne, sql, type AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { candidateIntake, candidateIntakeMergeEvents, employees } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { requireHrIntake } from "@/lib/hr/intake-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { intakeProgress } from "@/lib/hr/candidate/intake-schema";
import { normalizeMobile } from "@/lib/hr/candidate/aadhaar-kyc";

/**
 * ONE CANDIDATE, ONE RECORD.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────
 * A candidate can be created on the spot from the evaluation form, from a name
 * and a phone number alone, BEFORE they have filled anything
 * (`createQuickCandidate`). That row — call it A, the PLACEHOLDER — is where the
 * interviewer's assessment is written.
 *
 * When the candidate later fills the interview form they get a DIFFERENT row —
 * B, the SURVIVOR — because `saveCandidateDraft` matches on id only and
 * `inviteCandidateByLink` matches on email. Nothing joined the two, so "what the
 * candidate wrote" and "what the interviewer thought" ended up on two records
 * and could not be read in one place.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * B ALWAYS SURVIVES, and nothing else is copied. B owns the candidate's guest
 * login, their access links, their policy signatures and their form-index rows,
 * and its name is the one the candidate typed correctly themselves — where the
 * placeholder holds whatever a hurried HR person typed while the interview was
 * starting. So the assessment moves onto B, and A is RETIRED.
 *
 * RETIRED, NOT DELETED. A keeps every byte it had (see the copy-not-move note
 * in `mergeCandidateIntake`), gets `merged_into_id` set, and drops out of every
 * candidate picker. Undoing it is one UPDATE.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The last 10 digits of a number, or null when it cannot be one.
 *
 * Reused from the Aadhaar/KYC layer rather than re-defined: "what counts as a
 * mobile number" already has exactly one answer in this codebase, and this
 * feature turns entirely on two sides agreeing about it. `inviteCandidateByLink`
 * stores digits only; `createQuickCandidate` stores what HR typed. Any
 * comparison of the raw strings therefore misses the case this exists for.
 */
function phoneKey(mobile: string | null | undefined): string | null {
  // normalizeMobile returns "" for anything that is not a 10-digit number, so
  // this needs no second length check.
  return normalizeMobile(mobile) || null;
}

/** The SQL half of the same rule — "every non-digit removed" — kept beside
 *  `phoneKey` so the two can never drift apart. */
const DIGITS = (col: AnyColumn) =>
  sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;

export interface IntakeMatch {
  id: string;
  fullName: string;
  positionApplied: string | null;
  mobile: string | null;
  submitted: boolean;
  /** How much of the form is answered, 0-100. The honest signal for "they have
   *  started": a row created by an invitation and never opened has a name and a
   *  number but nothing else, and this is what tells the two apart. */
  pct: number;
  updatedAt: Date;
}

/**
 * HAS THE NUMBER I ATTACHED STARTED FILLING THE FORM?
 *
 * Called by the evaluation screen when the selected candidate changes — an
 * action rather than a page prop, because the answer CHANGES MID-SESSION (the
 * candidate submits while the screen is open, or a merge just happened) and a
 * prop cannot be re-asked.
 *
 * Guarded with `requireHrIntake`, the same tier the evaluation screen itself
 * uses: this reads rows the caller can already list. It is a read, so no write
 * rate limit.
 */
export async function findCandidateMatch(aId: string): Promise<
  Result<{ aHasForm: boolean; aMobile: string | null; matches: IntakeMatch[] }>
> {
  await requireHrIntake();
  if (!z.string().uuid().safeParse(aId).success) {
    return { ok: false, error: "Invalid candidate id." };
  }

  const [a] = await db
    .select({
      id: candidateIntake.id,
      mobile: candidateIntake.mobile,
      data: candidateIntake.data,
    })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, aId))
    .limit(1);
  if (!a) return { ok: false, error: "Candidate not found." };

  const aHasForm = Object.keys((a.data ?? {}) as Record<string, unknown>).length > 0;

  // No usable number means no automatic match — and, importantly, it is also
  // what stops two candidates with BLANK numbers matching each other.
  const key = phoneKey(a.mobile);
  if (!key) return { ok: true, aHasForm, aMobile: a.mobile, matches: [] };

  const rows = await db
    .select({
      id: candidateIntake.id,
      fullName: candidateIntake.fullName,
      positionApplied: candidateIntake.positionApplied,
      mobile: candidateIntake.mobile,
      data: candidateIntake.data,
      instances: candidateIntake.instances,
      submittedAt: candidateIntake.submittedAt,
      updatedAt: candidateIntake.updatedAt,
    })
    .from(candidateIntake)
    .where(
      and(
        ne(candidateIntake.id, aId),
        isNull(candidateIntake.mergedIntoId),
        // The `>= 10` guard is what stops `right('', 10) = ''`.
        sql`length(${DIGITS(candidateIntake.mobile)}) >= 10`,
        sql`right(${DIGITS(candidateIntake.mobile)}, 10) = ${key}`,
      ),
    )
    .orderBy(desc(candidateIntake.updatedAt))
    .limit(10);

  const matches: IntakeMatch[] = rows
    .map((r) => {
      const values = (r.data ?? {}) as Record<string, string>;
      const instances = (r.instances ?? {}) as Record<string, string[]>;
      return {
        id: r.id,
        fullName: r.fullName,
        positionApplied: r.positionApplied,
        mobile: r.mobile,
        submitted: r.submittedAt != null,
        pct: intakeProgress(values, instances),
        updatedAt: r.updatedAt,
      };
    })
    // A row with no answers at all is an invitation nobody has opened, not a
    // form in progress. Offering it as "has started" would be a lie.
    .filter((m) => m.pct > 0 || m.submitted);

  return { ok: true, aHasForm, aMobile: a.mobile, matches };
}

const MergeSchema = z
  .object({
    /** A — the placeholder, holding the evaluation. */
    retiredId: z.string().uuid(),
    /** B — the candidate's own form row. Always the survivor. */
    survivorId: z.string().uuid(),
  })
  .strict()
  .refine((v) => v.retiredId !== v.survivorId, {
    message: "Pick a different candidate to merge into.",
  });

import { planMerge } from "@/lib/hr/candidate/merge-plan";

/**
 * MERGE A PLACEHOLDER INTO THE CANDIDATE'S OWN FORM ROW.
 *
 * ── GUARD TIER: `requireHrStaff`, NOT the workspace-admin tier ─────────────
 * `deleteCandidateIntake` next door needs the admin tier because it destroys a
 * row and its whole history. This destroys NOTHING and is undone by one UPDATE,
 * so tiering by irreversibility puts it here — and decisively, A can only have
 * been created by `createQuickCandidate`, which is itself `requireHrStaff`. An
 * admin-tier guard would put the fix out of reach of the very person who
 * created the duplicate, at the moment they notice it.
 *
 * The UI hides the button from narrow intake grantees (`canMerge`), who can
 * still see the banner and open the form.
 *
 * ── COPY, NOT MOVE ─────────────────────────────────────────────────────────
 * A's blobs are COPIED onto B and left in place on A. A is never deleted and
 * never shown, so nulling it would buy nothing and cost the cheapest possible
 * undo: `update candidate_intake set merged_into_id = null where id = A`. It
 * also means a bug here cannot lose an interviewer's assessment.
 */
export async function mergeCandidateIntake(
  input: z.input<typeof MergeSchema>,
): Promise<Result<{ survivorId: string; survivorName: string; transferred: string[]; skipped: string[] }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MergeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { retiredId, survivorId } = parsed.data;

  const rows = await db
    .select({
      id: candidateIntake.id,
      fullName: candidateIntake.fullName,
      mobile: candidateIntake.mobile,
      data: candidateIntake.data,
      submittedAt: candidateIntake.submittedAt,
      evaluation: candidateIntake.evaluation,
      evaluationV2: candidateIntake.evaluationV2,
      managementAssessment: candidateIntake.managementAssessment,
      mergedIntoId: candidateIntake.mergedIntoId,
    })
    .from(candidateIntake)
    .where(inArray(candidateIntake.id, [retiredId, survivorId]));

  const a = rows.find((r) => r.id === retiredId);
  const bRaw = rows.find((r) => r.id === survivorId);
  if (!a) return { ok: false, error: "The record being merged was not found." };
  if (!bRaw) return { ok: false, error: "The candidate to keep was not found." };
  if (a.mergedIntoId) {
    return {
      ok: false,
      error: `${a.fullName || "That record"} has already been merged into another candidate.`,
    };
  }

  // Follow the survivor through its own tombstone, if it has one. A survivor can
  // itself have been merged away — this is what keeps "B was deleted, A came
  // back, someone merges into the old B" coherent instead of writing onto a row
  // no picker shows any more.
  let b = bRaw;
  if (b.mergedIntoId) {
    const [next] = await db
      .select({
        id: candidateIntake.id,
        fullName: candidateIntake.fullName,
        mobile: candidateIntake.mobile,
        data: candidateIntake.data,
        submittedAt: candidateIntake.submittedAt,
        evaluation: candidateIntake.evaluation,
        evaluationV2: candidateIntake.evaluationV2,
        managementAssessment: candidateIntake.managementAssessment,
        mergedIntoId: candidateIntake.mergedIntoId,
      })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, b.mergedIntoId))
      .limit(1);
    // Two hops is a cycle, not a chain. Refuse rather than loop.
    if (!next || next.mergedIntoId) {
      return { ok: false, error: "That candidate has already been merged into another record." };
    }
    b = next;
  }

  // THE SURVIVOR MUST BE A REAL FORM ROW. Otherwise "merge" could fold an
  // evaluation onto a second empty placeholder and the owner would be back to
  // two records with neither showing both. Safe in practice:
  // `inviteCandidateByLink` pre-fills personal.*, so every genuine candidate row
  // has data.
  const bHasForm =
    b.submittedAt != null || Object.keys((b.data ?? {}) as Record<string, unknown>).length > 0;
  if (!bHasForm) {
    return {
      ok: false,
      error: `${b.fullName || "That candidate"} has not filled any part of the interview form yet, so there is nothing to merge into.`,
    };
  }

  // ── WHAT GETS WRITTEN ─────────────────────────────────────────────────────
  // Decided by a PURE function in lib/hr/candidate/merge-plan.ts, so the rule
  // that matters — the survivor wins every tie, and nothing is discarded
  // silently — is unit-tested exhaustively without needing a database.
  const plan = planMerge({ a, b });
  const { transferred, skipped } = plan;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(candidateIntake)
        .set({
          evaluationV2: plan.evaluationV2,
          evaluation: plan.evaluation,
          managementAssessment: plan.managementAssessment,
          updatedAt: new Date(),
        })
        .where(eq(candidateIntake.id, b.id));

      await tx.insert(candidateIntakeMergeEvents).values({
        retiredIntakeId: a.id,
        survivorIntakeId: b.id,
        retiredName: a.fullName,
        retiredMobile: a.mobile,
        survivorName: b.fullName,
        survivorMobile: b.mobile,
        transferred,
        skipped,
        // Redundancy by design (see copy-not-move above): the operation stays
        // recoverable even if A is later deleted outright.
        restorePayload: {
          evaluation: a.evaluation ?? null,
          evaluationV2: a.evaluationV2 ?? null,
          managementAssessment: a.managementAssessment ?? null,
        },
        actorEmployeeId: me.id,
      });

      await tx
        .update(candidateIntake)
        .set({ mergedIntoId: b.id, updatedAt: new Date() })
        .where(eq(candidateIntake.id, a.id));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the records." };
  }

  // Every surface that lists candidates, plus the form chooser.
  revalidatePath("/hr/evaluation");
  revalidatePath("/hr/candidates");
  revalidatePath("/hr/management-assessment");
  revalidatePath("/hr/intake");

  return { ok: true, survivorId: b.id, survivorName: b.fullName, transferred, skipped };
}

/**
 * The merge audit, newest first — for the recovery path.
 *
 * Super-admin only, and deliberately NOT wired into the evaluation screen: the
 * ordinary fix is the button beside the candidate, and un-merging is an
 * administrative act, not part of evaluating anybody.
 */
export async function listRecentMerges(limit = 25): Promise<
  Result<{
    rows: {
      id: string;
      retiredName: string | null;
      survivorName: string | null;
      survivorIntakeId: string | null;
      retiredIntakeId: string | null;
      actorName: string | null;
      occurredAt: Date;
      undoneAt: Date | null;
      transferred: string[];
      skipped: string[];
    }[];
  }>
> {
  await requireHrStaff();
  const rows = await db
    .select({
      id: candidateIntakeMergeEvents.id,
      retiredName: candidateIntakeMergeEvents.retiredName,
      survivorName: candidateIntakeMergeEvents.survivorName,
      survivorIntakeId: candidateIntakeMergeEvents.survivorIntakeId,
      retiredIntakeId: candidateIntakeMergeEvents.retiredIntakeId,
      actorName: employees.name,
      occurredAt: candidateIntakeMergeEvents.occurredAt,
      undoneAt: candidateIntakeMergeEvents.undoneAt,
      transferred: candidateIntakeMergeEvents.transferred,
      skipped: candidateIntakeMergeEvents.skipped,
    })
    .from(candidateIntakeMergeEvents)
    .leftJoin(employees, eq(employees.id, candidateIntakeMergeEvents.actorEmployeeId))
    .orderBy(desc(candidateIntakeMergeEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return {
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      transferred: (r.transferred ?? []) as string[],
      skipped: (r.skipped ?? []) as string[],
    })),
  };
}
