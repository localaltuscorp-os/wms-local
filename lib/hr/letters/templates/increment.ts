/**
 * SALARY INCREMENT LETTER — formal notice revising an employee's compensation in
 * recognition of performance, effective a stated date.
 *
 * Placed on the Compensation card. Red (editable) fields: date, employeeName
 * (reused in the "To," block and the greeting), effectiveDate (reused in the body
 * and the term-row block), presentCtc, revisedCtc, designation, plus the
 * signatory designation and place. The company name is the literal `{firm}`
 * token, auto-resolved to the selected paying entity; pronoun tokens are not
 * needed here. The "For <entity>" line follows the letterhead's paying entity
 * (defaults to Altus Corp) and is e-signed by CA Manan Vasa.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  t,
  f,
  para,
  heading,
  term,
  signature,
} from "../types";

const template: LetterTemplate = {
  key: "increment",
  title: "Salary Increment Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Revise an employee's compensation in recognition of performance, effective a stated date.",
  blocks: [
    para(t("Date: "), f("date", "Date", { placeholder: "DD/MM/YYYY", date: true })),
    para(t("To,")),
    para(f("employeeName", "Employee Name", { placeholder: "Full name" })),
    heading("Subject: Revision in Compensation — Salary Increment", 3),
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),
    para(
      t(
        "In recognition of your performance, dedication and valuable contribution to {firm}, the management is pleased to revise your compensation with effect from ",
      ),
      f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 April 2026", date: true }),
      t(". The revised details of your compensation are set out below."),
    ),
    term("Present CTC (₹/annum)", f("presentCtc", "Present CTC", { placeholder: "e.g. 6,00,000" })),
    term("Revised CTC (₹/annum)", f("revisedCtc", "Revised CTC", { placeholder: "e.g. 7,20,000" })),
    term("Effective Date", f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 April 2026", date: true })),
    term("Designation", f("designation", "Designation", { placeholder: "e.g. Accounts Executive" })),
    para(
      t(
        "All other terms and conditions of your Appointment Letter remain unchanged and in full force. The detailed break-up of your revised CTC is annexed to this letter for your reference.",
      ),
    ),
    para(
      t(
        "Congratulations on this well-deserved increment. We deeply appreciate your efforts and look forward to your continued success and long association with {firm}.",
      ),
    ),
    para(t("Regards,")),
    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [f("signatoryDesignation", "Designation", { defaultValue: "Founder" })],
      showDate: true,
      place: [f("place", "Place", { defaultValue: "Mumbai" })],
    }),
  ],
};

export default template;
