import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getHrForm } from "./registry";
import {
  hrFormSubmissions,
  type HrFormResponse,
  type HrFormStatus,
} from "./schema";

/**
 * Record (or update) a form's index row. This is the ONE write path into
 * `hr_form_submissions` — every form that wants to appear in My/All Filled Forms
 * calls this from its own save action, right after it has written its own table.
 *
 * ORDERING MATTERS, and it is the caller's job: write your own table FIRST, then
 * call this. The owning table stays the source of truth, so if the index write
 * fails the form is still saved — the row just hasn't been indexed yet, which a
 * later save repairs. Doing it the other way round would let the index advertise
 * a submission that was never stored.
 *
 * Idempotent per (formKey, employeeId, sourceId), and ATOMICALLY so: one
 * INSERT ... ON CONFLICT DO UPDATE arbitrated by the partial unique index from
 * migration 0181. This used to be a SELECT followed by an INSERT-or-UPDATE, and
 * that lost a race it hits routinely — the exit forms autosave every 1.4s, so a
 * Submit click overlapping an autosave gave two concurrent server actions that
 * both missed the SELECT, and the loser's INSERT died on the unique index. The
 * caller only logs that failure, so the visible symptom was a submission that
 * never reached My Filled Forms and an HR desk that was never mailed.
 */
export async function recordHrFormSubmission(input: {
  formKey: string;
  /**
   * WHOSE form this is — the subject, not necessarily the person filling it.
   *
   * Supply EXACTLY the one that matches the form's registry `subject`:
   * `employeeId` for an employee form, `candidateIntakeId` for a candidate-stage
   * one. Passing the wrong one, both, or neither is rejected below rather than
   * written, because the database CHECK would reject it anyway and a caller
   * mid-save deserves a readable reason instead of a constraint name.
   */
  employeeId?: string;
  /** The candidate_intake row, for forms filled before the person is an employee. */
  candidateIntakeId?: string;
  /** WHO is filling it (the signed-in user). */
  submittedById: string;
  /** `draft` for Save Draft, `submitted` for Submit. */
  status: HrFormStatus;
  /** The completed responses, already flattened to question/answer pairs. */
  responses: HrFormResponse[];
  /**
   * The row id in the form's OWN table, so the index can point back at it.
   *
   * REQUIRED. Every registered form owns a table (`HrFormDef.sourceTable` is
   * mandatory), so every one of them has a row id by the time it calls this.
   * When this was optional the lookup was skipped entirely for a null id and
   * every save inserted a fresh row — one per 1.4s autosave tick — because the
   * unique index is partial and does not constrain NULL source ids either.
   */
  sourceId: string;
}): Promise<
  | {
      ok: true;
      id: string;
      /**
       * TRUE only on the transition into `submitted` — a fresh submit, or a
       * draft that has just been submitted. Re-saving an already-submitted form
       * returns FALSE.
       *
       * This exists so callers can fire submit-time side effects (mailing HR the
       * completed PDF) exactly once. Keying off the caller's own `status` would
       * re-send on every subsequent HR edit, because those come through as
       * `status: "submitted"` too.
       */
      newlySubmitted: boolean;
    }
  | { ok: false; error: string }
> {
  const def = getHrForm(input.formKey);
  if (!def) return { ok: false, error: `Unknown form "${input.formKey}".` };
  if (!input.sourceId) {
    return { ok: false, error: "A submission must reference its source row." };
  }

  // The registry decides which subject a form takes, so a caller cannot quietly
  // file an employee form against a candidate (or the reverse) and land a row
  // that no list surface will ever join to a name.
  const isCandidate = def.subject === "candidate";
  const subjectId = isCandidate ? input.candidateIntakeId : input.employeeId;
  if (!subjectId) {
    return {
      ok: false,
      error: isCandidate
        ? `"${def.key}" is a candidate form — it needs a candidateIntakeId.`
        : `"${def.key}" is an employee form — it needs an employeeId.`,
    };
  }
  if (isCandidate ? input.employeeId : input.candidateIntakeId) {
    return { ok: false, error: `"${def.key}" must carry exactly one subject.` };
  }

  // Only a real submit stamps the time, and only once — see the `coalesce` in
  // the conflict branch, which keeps an existing stamp rather than moving it.
  const now = new Date();
  const submittedAt = input.status === "submitted" ? now : null;

  try {
    const [row] = await db
      .insert(hrFormSubmissions)
      .values({
        formKey: def.key,
        formName: def.name,
        section: def.section,
        employeeId: isCandidate ? null : subjectId,
        candidateIntakeId: isCandidate ? subjectId : null,
        submittedById: input.submittedById,
        status: input.status,
        responses: input.responses,
        sourceTable: def.sourceTable,
        sourceId: input.sourceId,
        submittedAt,
      })
      .onConflictDoUpdate({
        // Two partial unique indexes exist, one per subject, and Postgres infers
        // an arbiter from the target columns PLUS the restated predicate. Naming
        // the employee index for a candidate row would not merely pick the wrong
        // arbiter — it would match no index at all and the statement would raise
        // instead of upserting, which for an autosave means a duplicate row per
        // tick the moment the error is swallowed.
        target: isCandidate
          ? [
              hrFormSubmissions.formKey,
              hrFormSubmissions.candidateIntakeId,
              hrFormSubmissions.sourceId,
            ]
          : [
              hrFormSubmissions.formKey,
              hrFormSubmissions.employeeId,
              hrFormSubmissions.sourceId,
            ],
        targetWhere: isCandidate
          ? sql`${hrFormSubmissions.candidateIntakeId} is not null and ${hrFormSubmissions.sourceId} is not null`
          : sql`${hrFormSubmissions.sourceId} is not null`,
        set: {
          formName: def.name,
          section: def.section,
          submittedById: input.submittedById,
          responses: input.responses,
          sourceTable: def.sourceTable,
          updatedAt: now,
          // Status never walks BACKWARDS. A form that has been submitted stays
          // submitted: an HR edit afterwards updates the responses without
          // demoting the row to a draft and yanking it out of the employee's
          // Submitted list. Inside DO UPDATE SET, the qualified column is the
          // row as it exists NOW and `excluded` is the row we proposed.
          status: sql`case when ${hrFormSubmissions.status} = 'submitted'
                           then 'submitted' else excluded.status end`,
          // Stamped ONCE, on the transition in. An existing stamp survives, so
          // re-saving a submitted form never moves its submission date.
          submittedAt: sql`coalesce(${hrFormSubmissions.submittedAt}, excluded.submitted_at)`,
        },
      })
      .returning({
        id: hrFormSubmissions.id,
        submittedAt: hrFormSubmissions.submittedAt,
      });

    if (!row) return { ok: false, error: "Could not record the submission." };

    // The stamp IS the transition: `submitted_at` is written exactly once, by
    // whichever statement first flipped the row to submitted, and never moves
    // after. So "this statement's timestamp came back" is precisely "this
    // statement is the one that submitted it" — which is what makes the HR mail
    // fire exactly once. RETURNING cannot see the pre-update row, so there is no
    // before/after status to compare instead.
    const newlySubmitted =
      input.status === "submitted" && row.submittedAt?.getTime() === now.getTime();

    return { ok: true, id: row.id, newlySubmitted };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not record the submission.",
    };
  }
}

/**
 * Drop a stale index row after its source row was re-parented to another
 * employee.
 *
 * The index is keyed by (form, employee, source row), so changing WHOSE form a
 * record is leaves the previous employee holding a row that points at what is
 * now somebody else's record — and `canViewHrSubmission` still lets them read
 * it. The index is a derived snapshot, so deleting and re-recording is the
 * correct repair; the owning table is untouched.
 *
 * Best-effort by design: the caller is mid-save and a failure here must not cost
 * the user their form. A leftover row is a visible wrong entry, not lost data.
 */
export async function forgetHrFormSubmission(input: {
  formKey: string;
  employeeId: string;
  sourceId: string;
}): Promise<void> {
  try {
    await db
      .delete(hrFormSubmissions)
      .where(
        and(
          eq(hrFormSubmissions.formKey, input.formKey),
          eq(hrFormSubmissions.employeeId, input.employeeId),
          eq(hrFormSubmissions.sourceId, input.sourceId),
        ),
      );
  } catch (e) {
    console.error("[hr-forms] could not drop the re-parented index row:", e);
  }
}
