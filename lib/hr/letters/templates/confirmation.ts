/**
 * End of Probation — Confirmation Letter.
 *
 * Placed on the Post-Joining card ("End of Probation"). Transcribed verbatim
 * from the Altus source ("Confirmation of Employment Upon Successful Completion
 * of Probation"). Red editable fields: date, employeeName (greeting + salutation
 * stay in sync via the shared id), company (default Altus Corp, reused
 * throughout), joiningDate, probationEndDate, designation, confirmationDate, plus
 * the signatory name / designation. The "For <entity>" line is driven by the
 * selected paying entity (defaults to Altus Corp) and can be swapped live.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  t,
  f,
  para,
  heading,
  signature,
} from "../types";

const template: LetterTemplate = {
  key: "confirmation",
  title: "End of Probation — Confirmation Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Confirm the employee as permanent on successful completion of probation.",
  blocks: [
    para(t("Date: "), f("date", "Date", { placeholder: "DD/MM/YYYY", date: true })),
    para(t("To,")),
    para(f("employeeName", "Employee Name", { placeholder: "Full name" })),
    heading("Subject: Confirmation of Employment Upon Successful Completion of Probation", 3),
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),
    para(
      t("We are pleased to inform you that you have successfully completed your probation period, which commenced on "),
      f("joiningDate", "Joining Date", { placeholder: "e.g. 5 January 2026", date: true }),
      t(" and concluded on "),
      f("probationEndDate", "Probation End Date", { placeholder: "e.g. 5 July 2026", date: true }),
      t("."),
    ),
    para(
      t("Based on your performance, commitment, and contribution to "),
      t("{firm}"),
      t(", we are delighted to confirm your appointment as a permanent employee in the position of "),
      f("designation", "Designation", { placeholder: "e.g. Accounts Executive" }),
      t(", effective "),
      f("confirmationDate", "Confirmation Date", { placeholder: "e.g. 6 July 2026", date: true }),
      t("."),
    ),
    para(
      t(
        "During your probation, you demonstrated professionalism, dedication, and a positive attitude towards your responsibilities. We appreciate your efforts and look forward to your continued contribution to the growth and success of the Firm.",
      ),
    ),
    para(
      t(
        "Your employment will continue under the terms and conditions outlined in your Appointment Letter and in accordance with the Firm's policies, as amended from time to time. All applicable employee benefits and entitlements will be available to you in accordance with Firm policy.",
      ),
    ),
    para(
      t("Congratulations on successfully completing your probation. We wish you continued success and look forward to a long and rewarding association with "),
      t("{firm}"),
      t("."),
    ),
    para(t("Yours sincerely,")),
    signature({
      forEntity: true,
      esign: false,
      name: [f("signatoryName", "Name", { placeholder: "Signatory name" })],
      designation: [f("signatoryDesignation", "Designation", { placeholder: "e.g. Founder" })],
    }),
  ],
};

export default template;
