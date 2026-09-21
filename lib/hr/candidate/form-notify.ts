import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake } from "@/db/schema";
import { sendPlainEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import { formatDateHr } from "@/lib/format";
import {
  candidateFormSubmittedRecipients,
  candidateFormEditedRecipients,
} from "@/lib/hr/notify-recipients";

/**
 * Tell HR a candidate has filled — or changed — their Candidate Form.
 *
 *   · "submitted" — the FIRST submit: Rutvisha, the HR desk and Manan.
 *   · "edited"    — a re-submit of an already-submitted form: the HR desk only.
 *
 * Edits are announced on RE-SUBMIT, not on every autosave: the wizard saves a
 * draft every few seconds while someone types, and one mail per keystroke burst
 * would bury the HR inbox.
 *
 * NEVER THROWS. The candidate's form is already saved; a mail failure is logged
 * for the operator and must not surface to the candidate as a failed submit.
 */
export async function notifyCandidateForm(intakeId: string, kind: "submitted" | "edited"): Promise<void> {
  try {
    const [row] = await db
      .select({
        fullName: candidateIntake.fullName,
        email: candidateIntake.email,
        mobile: candidateIntake.mobile,
        position: candidateIntake.positionApplied,
      })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, intakeId))
      .limit(1);
    if (!row) return;

    const name = row.fullName?.trim() || "A candidate";
    const to = kind === "submitted" ? candidateFormSubmittedRecipients() : candidateFormEditedRecipients();
    const subject =
      kind === "submitted"
        ? `${name} has filled the Candidate Form`
        : `${name} has edited their Candidate Form`;

    const res = await sendPlainEmail({
      to,
      subject,
      text: [
        kind === "submitted"
          ? `${name} has filled and submitted the Candidate Form.`
          : `${name} has made changes to their Candidate Form and submitted it again.`,
        ``,
        `Name: ${name}`,
        ...(row.position ? [`Position applied: ${row.position}`] : []),
        ...(row.mobile ? [`Cell: ${row.mobile}`] : []),
        ...(row.email ? [`Email: ${row.email}`] : []),
        `Date: ${formatDateHr(new Date())}`,
        ``,
        `Open the candidate records: ${siteUrl()}/hr/candidates`,
        ``,
        `— Altus Corp Dashboard`,
      ].join("\n"),
    });
    if (res.error) console.warn(`[candidate-form] HR notify (${kind}) not sent: ${res.error}`);
  } catch (err) {
    console.warn(`[candidate-form] HR notify (${kind}) threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
