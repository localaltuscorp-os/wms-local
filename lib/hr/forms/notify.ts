import "server-only";
import { loadSubmissionRow, submissionFilename } from "./load";
import { sendHrFormPdfEmail } from "@/lib/email/hr-form-email";
import { hrDeskEmail } from "@/lib/hr/firm";

/**
 * Mail a just-submitted form to the HR desk, as a PDF attachment.
 *
 * WHY THIS IS AUTOMATIC: a filled form that only exists inside the app is a
 * form nobody acts on. HR asked to receive completed paperwork by mail, and the
 * "Mail" button on the list is a manual step someone has to remember — for a
 * compliance record, remembering is not a control.
 *
 * FIRES ONCE, on the transition into `submitted`. Callers gate on
 * `recordHrFormSubmission`'s `newlySubmitted` flag, so:
 *   • Save Draft never mails (half-filled paperwork landing in HR's inbox
 *     looking final is exactly how the wrong thing gets acted on), and
 *   • a later HR edit of an already-submitted form does not re-send.
 *
 * RUN IT VIA `afterResponse`. Rendering a PDF and calling Resend must not sit on
 * the save's critical path — the employee's form is already durable by then, and
 * the architecture's persist-then-return rule (docs/ARCHITECTURE.md, Operation
 * Butter) puts everything else after the response.
 *
 * NEVER THROWS. A mail failure must not surface as a save failure: the form IS
 * saved, and telling someone otherwise pushes them to re-enter it. Failures are
 * logged for the server operator and the "Mail" button remains as the manual
 * retry.
 */
export async function mailSubmittedFormToHr(submissionId: string): Promise<void> {
  try {
    const to = hrDeskEmail();
    if (!to) {
      console.error("[hr-forms] no HR desk address configured; submit mail skipped");
      return;
    }

    const row = await loadSubmissionRow(submissionId);
    if (!row) {
      console.error(`[hr-forms] submission ${submissionId} vanished before its mail`);
      return;
    }

    // Imported lazily, matching the PDF route: pdfkit is a heavy server-only
    // dependency and nothing on a plain save should pay to load it.
    const { renderHrFormPdf } = await import("./pdf");
    const pdf = await renderHrFormPdf(row);

    const sent = await sendHrFormPdfEmail({
      to,
      // The form's SUBJECT, not the recipient — this copy is addressed to HR
      // about someone, so the greeting must not use HR's own name.
      recipientName: row.employeeName,
      formName: row.formName,
      sectionLabel: row.sectionLabel,
      submittedOn: row.submittedOn,
      status: row.status,
      pdf,
      filename: submissionFilename(row.formName, row.employeeName),
    });

    if (!sent.ok && !sent.skipped) {
      console.error(`[hr-forms] HR mail failed for submission ${submissionId}`);
    }
  } catch (e) {
    console.error("[hr-forms] HR mail threw:", e instanceof Error ? e.message : e);
  }
}
