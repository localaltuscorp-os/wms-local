import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, employees } from "@/db/schema";
import { hrFormSubmissions } from "./schema";
import { hrSectionLabel } from "./registry";
import { canViewHrSubmission } from "./access";
import { formatDate } from "@/lib/format";
import type { FormPdfInput } from "./pdf";

/**
 * Load one submission AND authorise it in a single call.
 *
 * The PDF route and the email route both need exactly this — fetch the row,
 * check the caller may see it, shape it for rendering. Splitting those three
 * steps across two routes is how one of them eventually ships without the
 * middle one. Returning a discriminated result keeps the check impossible to
 * forget: there is no way to reach `data` without having passed `allowed`.
 */
export type LoadedSubmission = FormPdfInput & {
  id: string;
  /** NULL when the subject is a candidate — see `canViewHrSubmission`. */
  employeeId: string | null;
  employeeEmail: string | null;
  /** The subject's name, whichever kind of subject it is. */
  employeeName: string;
};

export type LoadResult =
  | {
      ok: true;
      data: LoadedSubmission;
      /** Whether the viewer reached this as HR staff rather than as its subject.
       *  Carried out of the access check that already computed it, so the View
       *  page can pick its "back to" list without asking a second time. */
      isHrStaff: boolean;
    }
  | { ok: false; status: 404 | 403 };

/**
 * Fetch and shape a submission WITHOUT any permission check.
 *
 * NOT for request handlers — `loadAuthorisedSubmission` is the door they use.
 * This exists for server-side senders that have already authorised the actor by
 * other means and are not acting on behalf of a viewer at all: the submit-time
 * mail to the HR desk runs inside `after()`, where there is no viewer to check
 * and where `canViewHrSubmission`'s `requireUser()` would be the wrong question
 * anyway (the recipient is HR, not the caller).
 *
 * `server-only` at the top of this module is what keeps it off the client.
 */
export async function loadSubmissionRow(id: string): Promise<LoadedSubmission | null> {
  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      responses: hrFormSubmissions.responses,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
      employeeId: hrFormSubmissions.employeeId,
      employeeName: employees.name,
      employeeEmail: employees.email,
      candidateName: candidateIntake.fullName,
      candidateEmail: candidateIntake.email,
    })
    .from(hrFormSubmissions)
    // BOTH joins are LEFT and exactly one matches, because the subject CHECK from
    // 0203 guarantees exactly one of the two ids is set. This used to be an INNER
    // join on employees, which silently returned NOTHING for a candidate-subject
    // row — the View page would 404 on a form that plainly exists in the list.
    .leftJoin(employees, eq(hrFormSubmissions.employeeId, employees.id))
    .leftJoin(candidateIntake, eq(hrFormSubmissions.candidateIntakeId, candidateIntake.id))
    .where(eq(hrFormSubmissions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    formName: row.formName,
    sectionLabel: hrSectionLabel(row.section),
    employeeId: row.employeeId,
    // Whichever subject the row carries. The fallback is a placeholder, not a
    // guess: a submission whose subject row was deleted still has to render.
    employeeName: row.employeeName ?? row.candidateName ?? "(unknown)",
    employeeEmail: row.employeeEmail ?? row.candidateEmail ?? null,
    submittedOn: row.submittedAt ? formatDate(row.submittedAt) : formatDate(row.updatedAt),
    status: row.status,
    responses: row.responses ?? [],
  };
}

export async function loadAuthorisedSubmission(id: string): Promise<LoadResult> {
  const data = await loadSubmissionRow(id);
  if (!data) return { ok: false, status: 404 };

  const access = await canViewHrSubmission(data.employeeId);
  // 404 rather than 403: confirming that someone else's submission exists is
  // itself a leak, and the caller has no legitimate use for the distinction.
  if (!access.allowed) return { ok: false, status: 404 };

  return { ok: true, data, isHrStaff: access.isHrStaff };
}

// Re-exported so the routes that load a submission and name its download keep
// importing from one place. The implementations are pure and live in ./filename,
// away from this module's DB client.
export { submissionFilename, contentDispositionAttachment } from "./filename";
