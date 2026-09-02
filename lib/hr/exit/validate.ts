import { CLEARANCE_ROWS } from "./content";
import { exitInterviewResponses } from "@/lib/hr/forms/exit-responses";
import type { ExitKind, ExitRecordData, ExitInterviewData, ExitHandoverData } from "./schema";

/**
 * What makes an Exit form fit to SUBMIT (as opposed to save as a draft).
 *
 * PURE — no `server-only`, no DB. The client forms call it to stop a doomed
 * click before it costs a round trip, and the server action calls it again as
 * the actual rule; sharing one module is what keeps those two answers identical.
 * Same reasoning `lib/hr/forms/exit-responses.ts` gives for staying pure.
 *
 * WHY THIS EXISTS: Submit used to accept a completely blank form. That wrote an
 * index row with `responses: []`, which renders as a PDF reading "No answers were
 * recorded on this form" — and then mails it to the HR desk. Drafts stay
 * deliberately unvalidated: a draft is unfinished by definition, and the 1.4s
 * autosave must never fail on a half-filled form.
 *
 * Validation is intentionally THIN. This is HR paperwork filled in conversation,
 * often across two sittings; the bar is "this is a real, attributable form", not
 * "every question is answered". Requiring more would push people to type filler.
 */
export type ExitValidation =
  | { ok: true }
  | { ok: false; error: string; missing: string[] };

/** Trim so a whitespace-only value counts as unanswered, matching `clean()` in exit-responses. */
function filled(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Exit Interview (Annexure B): dated, signed, and carrying at least one real
 * answer.
 *
 * "At least one real answer" reuses the flattener rather than re-listing every
 * question key — `exitInterviewResponses` already knows which fields are
 * questions and already drops blanks, so anything it emits outside the "Details"
 * group is a genuine answer. Re-listing the keys here is exactly how this would
 * drift the next time a question is added to the form.
 */
function validateInterview(data: ExitInterviewData): ExitValidation {
  const fields = data.fields ?? {};
  const missing: string[] = [];
  if (!filled(fields.header_dateOfInterview)) missing.push("header_dateOfInterview");
  if (!filled(fields.sign_employeeName)) missing.push("sign_employeeName");

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error:
        missing.length === 2
          ? "Add the interview date and the employee signature before submitting."
          : missing[0] === "header_dateOfInterview"
            ? "Add the date of the exit interview before submitting."
            : "Add the employee signature before submitting.",
    };
  }

  const answered = exitInterviewResponses(data).some((r) => r.group !== "Details");
  if (!answered) {
    return {
      ok: false,
      missing: ["q1"],
      error: "Answer at least one question before submitting this interview.",
    };
  }
  return { ok: true };
}

/**
 * Handover & Clearance (Annexure A): a last working day, and at least one item
 * actually cleared.
 *
 * Not "all items cleared" on purpose — a handover is submitted while clearances
 * are still outstanding, and the PDF exists precisely to show F&F what is still
 * pending. Blocking on a full checklist would make the form unusable for the job
 * it does.
 */
function validateHandover(data: ExitHandoverData): ExitValidation {
  const fields = data.fields ?? {};
  const checked = data.checked ?? {};
  if (!filled(fields.header_lastWorkingDay)) {
    return {
      ok: false,
      missing: ["header_lastWorkingDay"],
      error: "Add the last working day before submitting.",
    };
  }
  const anyCleared = CLEARANCE_ROWS.some((row) => row.items.some((it) => checked[it.id]));
  if (!anyCleared) {
    return {
      ok: false,
      missing: [CLEARANCE_ROWS[0]?.items[0]?.id ?? "clearance"],
      error: "Tick at least one clearance item before submitting.",
    };
  }
  return { ok: true };
}

/** Dispatch on the exit record's `kind`, so callers don't branch themselves. */
export function validateExitSubmission(kind: ExitKind, data: ExitRecordData): ExitValidation {
  return kind === "interview"
    ? validateInterview(data as ExitInterviewData)
    : validateHandover(data as ExitHandoverData);
}
