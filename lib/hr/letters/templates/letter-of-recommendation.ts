/**
 * Letter of Recommendation.
 *
 * Placed on the Separation card. A "To Whomsoever It May Concern" reference for
 * a departing employee. Red editable fields: employeeName (reused so every
 * mention stays in sync), fromDate, toDate, designation, plus the signatory
 * designation / place. The firm name resolves from the selected paying entity
 * ({firm}); pronouns ({he}/{his}/{him}) resolve from the Gender selector.
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
  key: "letter-of-recommendation",
  title: "Letter of Recommendation",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "A 'To Whomsoever It May Concern' recommendation for a departing employee.",
  blocks: [
    heading("Sub: Letter of Recommendation", 3),
    para(t("To Whomsoever It May Concern")),
    para(
      t("I am pleased to write this letter of recommendation for "),
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Devraj Kadam" }),
      t(", who worked with us at {firm} from "),
      f("fromDate", "From Date", { placeholder: "e.g. 12th August 2024", date: true }),
      t(" to "),
      f("toDate", "To Date", { placeholder: "e.g. 20th May 2026", date: true }),
      t(". Having worked with "),
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Devraj Kadam" }),
      t(", I have seen {his} dedication and strong work ethic."),
    ),
    para(
      t("Throughout the time with us, "),
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Devraj Kadam" }),
      t(
        " has worked with passion and dedication. {he} has contributed and put {his} heart and soul into all the tasks that were entrusted to {him} during {his} tenure as a ",
      ),
      f("designation", "Designation", { placeholder: "e.g. Business Consultant" }),
      t(
        ". {he} was receptive to feedback, was a great team player and consistently demonstrated an eagerness to learn and grow.",
      ),
    ),
    para(
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Devraj Kadam" }),
      t(
        " is a hard-working and reliable professional who brings both discipline and commitment to {his} work. I was glad to mentor them and see {his} progress over time. I am confident that {he} will continue to excel in any professional environment {he} chooses to be a part of.",
      ),
    ),
    para(t("Please feel free to get in touch if you require any further information.")),
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
