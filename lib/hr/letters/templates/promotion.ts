/**
 * PROMOTION LETTER — formal elevation of an employee's role in recognition of
 * consistent performance, effective a stated date.
 *
 * Placed on the Compensation card. Red (editable) fields: date, employeeName
 * (reused in the "To," block and the greeting), currentDesignation and
 * newDesignation (each reused in the body and the term-row block), effectiveDate
 * (likewise reused), reportingTo, plus the signatory designation and place. The
 * company name is the literal `{firm}` token; pronoun tokens `{his}` / `{him}`
 * auto-resolve to the employee's gender. The "For <entity>" line follows the
 * letterhead's paying entity (defaults to Altus Corp) and is e-signed by
 * CA Manan Vasa.
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
  key: "promotion",
  title: "Promotion Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Elevate an employee's role in recognition of consistent performance, effective a stated date.",
  blocks: [
    para(t("Date: "), f("date", "Date", { placeholder: "DD/MM/YYYY", date: true })),
    para(t("To,")),
    para(f("employeeName", "Employee Name", { placeholder: "Full name" })),
    heading("Subject: Promotion & Elevation of Role", 3),
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),
    para(
      t(
        "Congratulations! In recognition of {his} consistent performance and commitment to {firm}, the management is delighted to promote {him} from ",
      ),
      f("currentDesignation", "Current Designation", { placeholder: "e.g. Accounts Executive" }),
      t(" to "),
      f("newDesignation", "New Designation", { placeholder: "e.g. Senior Accounts Executive" }),
      t(", with effect from "),
      f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 April 2026", date: true }),
      t(". The details of your elevated role are set out below."),
    ),
    term("From", f("currentDesignation", "Current Designation", { placeholder: "e.g. Accounts Executive" })),
    term("To", f("newDesignation", "New Designation", { placeholder: "e.g. Senior Accounts Executive" })),
    term("Effective Date", f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 April 2026", date: true })),
    term("Reporting To", f("reportingTo", "Reporting To", { placeholder: "e.g. Finance Manager" })),
    para(
      t(
        "In your new role you will be entrusted with greater responsibilities and are expected to lead by example, uphold the highest standards of professionalism and mentor those around you. The management has full confidence in {his} ability to excel in this position and to continue growing with the organisation.",
      ),
    ),
    para(
      t(
        "Your revised compensation, if any, arising out of this promotion will be communicated to you separately through the detailed CTC break-up.",
      ),
    ),
    para(
      t(
        "Once again, congratulations on this well-deserved promotion. We wish you continued success and a rewarding journey ahead with {firm}.",
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
