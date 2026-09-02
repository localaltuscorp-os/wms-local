/**
 * Types for `person-files.ts`. Split out because that module is `"use server"`,
 * which may export nothing but async functions — the same split the policy and
 * exit status loaders in this folder already use.
 */

/** One row of the HR forms index, resolved for ONE employee. */
export interface FiledFormRow {
  /** `hr_form_submissions.id` — what /hr/forms/[id] reads. */
  id: string;
  formKey: string;
  formName: string;
  sectionLabel: string;
  status: "draft" | "submitted";
  /** ISO. Falls back to last-updated for a draft, which has no submitted_at. */
  dateIso: string | null;
  /** The read-only submission page. Always this employee's — keyed by row id. */
  viewHref: string;
  /** Employee-scoped editor, or null when the form has no safe deep link. */
  editHref: string | null;
  /** Where the form lives, for the null-editHref case. */
  moduleHref: string | null;
}

/** One letter already issued to this employee, ready to open. */
export interface LetterFileRow {
  id: string;
  title: string;
  /** "Appointment Letter", "Increment Letter", … */
  label: string;
  /** ISO date the letter takes effect, when one was recorded. */
  dateIso: string | null;
  /** Short-lived signed URL, or null when the file could not be signed. */
  signedUrl: string | null;
}

export interface PersonFiles {
  /** True once the person resolved to an employee account. */
  matched: boolean;
  employeeId: string | null;
  forms: FiledFormRow[];
  letters: LetterFileRow[];
}

export const EMPTY_PERSON_FILES: PersonFiles = {
  matched: false,
  employeeId: null,
  forms: [],
  letters: [],
};
