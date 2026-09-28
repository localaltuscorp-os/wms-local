/**
 * RESUME — the one mandatory upload in the "Resume, Work Samples and Links"
 * block on the Candidate Interview Form's Personal Details step.
 *
 * Unlike the optional Work Samples list below it (any number of links/files,
 * never required — see work-samples.ts), the resume is a SINGLE file and DOES
 * gate submission. It still stores as an ordinary answer key (`personal.resume`,
 * a storage path), uploaded the same browser-straight-to-storage way as a work
 * sample, so it autosaves and resumes with the draft like everything else.
 *
 * The required-ness lives outside the generic schema (see intake-schema.ts's
 * RESUME_KEY handling in intakeRequiredKeys/sectionRequiredKeys) because file
 * uploads aren't a FormFieldDef type — same reasoning as Photo/Work Samples
 * being ad-hoc keys, just on the required side of that line instead of the
 * optional one.
 */

export const RESUME_KEY = "personal.resume";

export const RESUME_MAX_BYTES = 25 * 1024 * 1024;
export const RESUME_ACCEPT = "application/pdf,.pdf,.doc,.docx";

const ALLOWED_EXTENSIONS = /\.(pdf|doc|docx)$/i;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** Why a file can't be the resume, or null when it can. */
export function resumeFileProblem(input: { name: string; mime?: string | null; size?: number | null }): string | null {
  const name = String(input.name ?? "");
  const mime = String(input.mime ?? "").toLowerCase();
  if (!name.trim()) return "That file has no name.";
  if (!ALLOWED_EXTENSIONS.test(name) && !(mime && ALLOWED_MIME.has(mime))) {
    return "Upload the resume as a PDF or Word document (.pdf, .doc, .docx).";
  }
  if (Number(input.size ?? 0) > RESUME_MAX_BYTES) return "That file is over 25 MB.";
  return null;
}
